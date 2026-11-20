import "server-only";
import type { Sql, TransactionSql } from "postgres";
import { z } from "zod";
import { badgeDocumentSchema, VAT_RATE, type BadgeDocument } from "@/engine";
import { endPriceTable, type PriceModel } from "@/engine/price-model";
import { requireDb } from "@/lib/db/client";
import { WEB_SCOPE } from "@/lib/designer-stats/model";
import { recordDesignerEvent } from "@/lib/designer-stats/repository";
import { publicOrigin } from "@/lib/http/public-url";
import { withStoredLogoImages } from "@/lib/logo-images/repository";
import { deliverySchema, shippingMethodOf, type Delivery } from "@/lib/orders/delivery";
import { placeOrder } from "@/lib/orders/place-order";
import { shippingFor, storedPriceModel } from "@/lib/orders/price-lists";
import { priceWithPricing } from "@/lib/orders/pricing";
import { databaseConfigured, getPriceModel } from "@/lib/orders/repository";
import { OWNER_TENANT } from "@/lib/tenants/model";
import { createSession, getSession, SESSION_ID_PATTERN, stripeSettings, type CheckoutLine } from "./stripe";

type Json = Parameters<Sql["json"]>[0];

/** Så länge har kunden på sig att betala innan sessionen hos Stripe stängs. */
const SESSION_MS = 2 * 60 * 60 * 1000;
/** En kassa som aldrig betalades tas bort efter så här många dagar. */
const UNPAID_DAYS = 7;

/** Ordern som väntar på betalning. Den läggs först när Stripe har bekräftat betalningen. */
const payloadSchema = z.object({
  customer: z.object({ name: z.string().min(1), email: z.string().min(3) }),
  badges: z.array(badgeDocumentSchema).min(1),
  delivery: deliverySchema,
  badgeShot: z.string().nullable(),
  /** Besökets id i skyltmotorns statistik; saknas i äldre kassor. */
  visit: z.string().nullish(),
  /** Kundkontot som var inloggat i kassan; saknas i äldre kassor. */
  accountId: z.uuid().nullish(),
  /** Kundens eget inköpsnummer; saknas i äldre kassor. */
  customerPo: z.string().nullish(),
});

export interface CheckoutOrder {
  customer: { name: string; email: string };
  badges: BadgeDocument[];
  delivery: Delivery;
  badgeShot: string | null;
  /** Besökets slumpade id i skyltmotorns statistik, så att den betalda ordern räknas till besöket. */
  visit?: string | null;
  /** Kundkontot som var inloggat i kassan. Den betalda ordern visas då på kundens sida. */
  accountId?: string | null;
  /** Kundens eget inköpsnummer. */
  customerPo?: string | null;
}

/** Det kunden betalar med kort: skyltarna och frakten, med moms, i ören. */
export function checkoutLines(badges: readonly BadgeDocument[], model: PriceModel, delivery: Delivery): { lines: CheckoutLine[]; totalOre: number } {
  const shippingSek = shippingFor(model, badges, shippingMethodOf(delivery));
  const price = priceWithPricing(badges, null, endPriceTable(model), shippingSek);
  const totalOre = price.totalInclVatSek * 100;
  const shippingOre = Math.round(shippingSek * (1 + VAT_RATE)) * 100;
  const quantity = badges.reduce((sum, badge) => sum + badge.quantity, 0);
  const lines: CheckoutLine[] = [{ name: `Namnskyltar, ${quantity} st`, amountOre: totalOre - shippingOre }];
  if (shippingOre > 0) lines.push({ name: "Frakt", amountOre: shippingOre });
  return { lines, totalOre };
}

/**
 * Öppnar kortbetalningen för en privatperson. Ordern sparas som en väntande
 * kassa och svaret är adressen hos Stripe där kunden betalar. Ingen order finns
 * förrän betalningen är klar (`completeCheckout`).
 */
export async function startCheckout(order: CheckoutOrder, model: PriceModel): Promise<{ url: string }> {
  const settings = stripeSettings();
  if (!settings) throw new Error("Kortbetalning är inte aktiverad");
  const sql = requireDb();
  // Bilden sparas en gång på servern, så att kassan bara bär adressen till den.
  const badges = await withStoredLogoImages(order.badges);
  const { lines, totalOre } = checkoutLines(badges, model, order.delivery);
  const payload = { ...order, badges };
  const [row] = await sql<{ id: string }[]>`
    insert into checkouts (payload, price_model, amount_ore)
    values (${sql.json(payload as unknown as Json)}, ${sql.json(model as unknown as Json)}, ${totalOre})
    returning id`;
  if (!row) throw new Error("Kassan kunde inte sparas");
  const origin = publicOrigin();
  const session = await createSession(settings, {
    reference: row.id,
    email: order.customer.email,
    lines,
    // Stripe byter själv ut platshållaren mot sessionens id.
    successUrl: `${origin}/betalning/klar?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${origin}/betalning/avbruten?kassa=${row.id}`,
    expiresAt: new Date(Date.now() + SESSION_MS),
  });
  if (!session.url) throw new Error("Stripe svarade utan en adress att betala på");
  await sql`update checkouts set session_id = ${session.id} where id = ${row.id}`;
  return { url: session.url };
}

/**
 * `paid` = betalningen är klar och ordern finns. `unpaid` = kunden har inte
 * betalat (än). `unknown` = sessionen hör inte till någon kassa hos oss.
 */
export type CheckoutOutcome = { status: "paid"; orderNumber: string; orderPath: string } | { status: "unpaid" } | { status: "unknown" };

interface CheckoutRow {
  id: string;
  payload: unknown;
  price_model: unknown;
  amount_ore: number;
  order_id: string | null;
}

/**
 * Lägger ordern när Stripe har bekräftat betalningen. Anropas både av Stripes
 * webhook och av sidan kunden kommer tillbaka till, och ger samma order hur
 * många gånger den än körs: raden låses, och en kassa med order läggs inte igen.
 * Stripes eget svar avgör om sessionen är betald, aldrig det anroparen påstår.
 */
export async function completeCheckout(sessionId: string): Promise<CheckoutOutcome> {
  const settings = stripeSettings();
  if (!settings || !SESSION_ID_PATTERN.test(sessionId) || !databaseConfigured()) return { status: "unknown" };
  const sql = requireDb();
  // Ordernumret läses i en egen fråga efter att raden är låst. I samma fråga som låset skulle en
  // order som en annan körning just lade inte synas, och ordern läggas två gånger.
  const placed = async (from: Sql | TransactionSql, orderId: string): Promise<CheckoutOutcome> => {
    const [order] = await from<{ order_no: string; customer_token: string }[]>`select order_no, customer_token from orders where id = ${orderId}`;
    return order ? { status: "paid", orderNumber: order.order_no, orderPath: `/order/${order.customer_token}` } : { status: "unknown" };
  };
  const [found] = await sql<CheckoutRow[]>`
    select id, payload, price_model, amount_ore, order_id from checkouts where session_id = ${sessionId}`;
  if (!found) return { status: "unknown" };
  if (found.order_id) return placed(sql, found.order_id);
  const session = await getSession(settings, sessionId);
  if (!session.paid) return { status: "unpaid" };
  return sql.begin(async (tx): Promise<CheckoutOutcome> => {
    const [row] = await tx<CheckoutRow[]>`
      select id, payload, price_model, amount_ore, order_id from checkouts where session_id = ${sessionId} for update`;
    if (!row) return { status: "unknown" };
    // En annan körning hann före medan vi väntade på låset.
    if (row.order_id) return placed(tx, row.order_id);
    if (session.reference !== row.id || session.amountOre !== row.amount_ore || session.currency !== "sek") {
      throw new Error(`Betalningen ${sessionId} stämmer inte med kassan: belopp eller referens skiljer`);
    }
    const order = payloadSchema.parse(row.payload);
    const receipt = await placeOrder({
      customer: order.customer,
      badges: order.badges as BadgeDocument[],
      source: "web",
      tenant: OWNER_TENANT,
      // Samma priser som kunden betalade, även om prismodellen har ändrats under tiden.
      priceModel: storedPriceModel(row.price_model, await getPriceModel()),
      delivery: order.delivery,
      badgeShot: order.badgeShot,
      accountId: order.accountId ?? null,
      customerPo: order.customerPo ?? null,
      payment: {
        method: "card",
        provider: "stripe",
        reference: session.paymentRef ?? session.id,
        amountOre: row.amount_ore,
        paidAt: new Date().toISOString(),
      },
    });
    // Besöket i skyltmotorn slutade med en order. Statistiken får aldrig stoppa ordern.
    if (order.visit) void recordDesignerEvent(order.visit, WEB_SCOPE, "ordered").catch(() => undefined);
    // Kassan pekar på ordern och släpper kundens uppgifter: de finns på ordern nu.
    await tx`
      update checkouts
         set order_id = (select id from orders where order_no = ${receipt.orderNumber}), completed_at = now(), payload = '{}'::jsonb
       where id = ${row.id}`;
    return { status: "paid", orderNumber: receipt.orderNumber, orderPath: `/order/${receipt.customerToken ?? ""}` };
  });
}

/** Skyltarna i en kassa som aldrig betalades, så att kunden kan komma tillbaka till sin design. */
export async function unpaidCheckoutBadges(id: string): Promise<BadgeDocument[]> {
  if (!/^[0-9a-f-]{36}$/.test(id) || !databaseConfigured()) return [];
  const [row] = await requireDb()<{ payload: unknown }[]>`select payload from checkouts where id = ${id} and order_id is null`;
  const parsed = payloadSchema.safeParse(row?.payload);
  return parsed.success ? (parsed.data.badges as BadgeDocument[]) : [];
}

/** Tar bort kassor som aldrig betalades. Körs av bakgrundsjobbet. */
export async function pruneUnpaidCheckouts(): Promise<number> {
  if (!databaseConfigured()) return 0;
  const rows = await requireDb()`
    delete from checkouts where order_id is null and created_at < now() - make_interval(days => ${UNPAID_DAYS}) returning id`;
  return rows.length;
}
