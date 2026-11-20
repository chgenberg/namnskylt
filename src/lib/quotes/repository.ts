import "server-only";
import { randomBytes } from "node:crypto";
import type { Sql, TransactionSql } from "postgres";
import { z } from "zod";
import { badgeDocumentSchema, type BadgeDocument } from "@/engine";
import { endPriceTable, type PriceModel } from "@/engine/price-model";
import { requireDb } from "@/lib/db/client";
import { MISSING_LOGO_IMAGE_ERROR, missingLogoImages, withStoredLogoImages } from "@/lib/logo-images/repository";
import { parseQuoteDelivery, quoteDeliverySchema, shippingMethodOf, type QuoteDelivery } from "@/lib/orders/delivery";
import { isCustomPricing, parsePricing, priceWithPricing, type Pricing } from "@/lib/orders/pricing";
import { priceListsFor, shippingFor, storedPriceModel, type PriceAudience } from "@/lib/orders/price-lists";
import { getPriceModel } from "@/lib/orders/repository";
import { UNASSIGNED_CUSTOMER_EMAIL, isUnassignedCustomer } from "@/lib/orders/unassigned-customer";
import {
  addDays,
  isQuoteStatus,
  parseQuoteOptions,
  parseQuoteShots,
  QUOTE_VALID_DAYS,
  storedQuoteOptions,
  swedishDay,
  type QuoteEvent,
  type QuoteOptions,
  type QuoteShot,
  type QuoteStatus,
  type StoredQuote,
} from "./model";

const badgesSchema = z.array(badgeDocumentSchema);
type Json = Parameters<Sql["json"]>[0];

interface QuoteRow {
  id: string;
  quote_no: string;
  status: string;
  badges: unknown;
  pricing: unknown;
  price_model: unknown;
  total_sek: number;
  total_incl_vat_sek: number;
  message: string | null;
  valid_until: string;
  token: string;
  order_no: string | null;
  decline_reason: string | null;
  is_demo: boolean;
  created_at: Date;
  sent_at: Date | null;
  emailed_at: Date | null;
  decided_at: Date | null;
  customer_id: string;
  customer_name: string;
  customer_company: string | null;
  customer_email: string;
  customer_phone: string | null;
  customer_org_number: string | null;
  customer_address: string | null;
  customer_demo: boolean;
  events: { status: string; note: string | null; at: string }[] | null;
  badge_shot: string | null;
  project: string | null;
  reseller_id: string;
  delivery: unknown;
  options: unknown;
  shots: unknown;
}

function toQuote(row: QuoteRow, currentModel: PriceModel, audience: PriceAudience): StoredQuote {
  // Ett utkast utan kund pekar på säljarens platshållare. Dess uppgifter visas aldrig, och går aldrig att mejla till.
  const noCustomer = isUnassignedCustomer({ email: row.customer_email });
  const badges = badgesSchema.safeParse(row.badges);
  if (!badges.success) console.error(`Ogiltiga skyltar i offert ${row.quote_no}`);
  const events: QuoteEvent[] = (row.events ?? [])
    .filter((e): e is QuoteEvent => isQuoteStatus(e.status))
    .map((e) => ({ status: e.status, note: e.note, at: new Date(e.at).toISOString() }));
  return {
    id: row.id,
    badgeShot: row.badge_shot,
    project: row.project,
    resellerId: row.reseller_id,
    quoteNo: row.quote_no,
    customer: noCustomer
      ? { id: row.customer_id, name: "", company: null, email: "", phone: null, orgNumber: null, address: null, demo: false }
      : {
          id: row.customer_id,
          name: row.customer_name,
          company: row.customer_company,
          email: row.customer_email,
          phone: row.customer_phone,
          orgNumber: row.customer_org_number,
          address: row.customer_address,
          demo: row.customer_demo,
        },
    ...(noCustomer && { noCustomer }),
    status: isQuoteStatus(row.status) ? row.status : "draft",
    badges: badges.success ? badges.data : [],
    pricing: parsePricing(row.pricing),
    ...priceListsFor(row.price_model, currentModel, audience, badges.success ? badges.data : [], shippingMethodOf(parseQuoteDelivery(row.delivery))),
    totalSek: row.total_sek,
    totalInclVatSek: row.total_incl_vat_sek,
    message: row.message,
    validUntil: row.valid_until,
    token: row.token,
    orderNo: row.order_no,
    declineReason: row.decline_reason,
    delivery: parseQuoteDelivery(row.delivery),
    demo: row.is_demo,
    createdAt: row.created_at.toISOString(),
    sentAt: row.sent_at?.toISOString() ?? null,
    emailedAt: row.emailed_at?.toISOString() ?? null,
    decidedAt: row.decided_at?.toISOString() ?? null,
    events,
    options: parseQuoteOptions(row.options),
    shots: parseQuoteShots(row.shots),
  };
}

/** Stillbilden är den tunga kolumnen — listan klarar sig utan. */
function selectQuotes(sql: Sql, withShot = false) {
  return sql`
    select q.id, ${withShot ? sql`q.badge_shot` : sql`null::text`} as badge_shot, ${withShot ? sql`q.shots` : sql`null::jsonb`} as shots, q.project, q.reseller_id, q.delivery, q.options, q.quote_no, q.status, q.badges, q.pricing, q.price_model, q.total_sek, q.total_incl_vat_sek, q.message,
           to_char(q.valid_until, 'YYYY-MM-DD') as valid_until, q.token, q.decline_reason, q.is_demo,
           q.created_at, q.sent_at, q.emailed_at, q.decided_at, o.order_no,
           c.id as customer_id, c.name as customer_name, c.company as customer_company, c.email as customer_email,
           c.phone as customer_phone, c.org_number as customer_org_number, c.address as customer_address,
           c.is_demo as customer_demo,
           (select json_agg(json_build_object('status', e.status, 'note', e.note, 'at', e.at) order by e.at)
              from quote_events e where e.quote_id = q.id) as events
      from quotes q
      join customers c on c.id = q.customer_id
      left join orders o on o.id = q.order_id
  `;
}

export async function listQuotes(tenant: string): Promise<StoredQuote[]> {
  const sql = requireDb();
  const rows = await sql<QuoteRow[]>`${selectQuotes(sql)} where q.reseller_id = ${tenant} order by q.created_at desc`;
  const model = await getPriceModel();
  return rows.map((row) => toQuote(row, model, "reseller"));
}

export async function getQuote(tenant: string, quoteNo: string): Promise<StoredQuote | null> {
  const sql = requireDb();
  const [row] = await sql<QuoteRow[]>`${selectQuotes(sql, true)} where q.quote_no = ${quoteNo} and q.reseller_id = ${tenant}`;
  return row ? toQuote(row, await getPriceModel(), "reseller") : null;
}

/** Hela prismodellen offerten skapades med, så att ordern ärver den. Bara för servern. */
export async function quotePriceModel(quoteId: string): Promise<PriceModel> {
  const sql = requireDb();
  const [row] = await sql<{ price_model: unknown }[]>`select price_model from quotes where id = ${quoteId}`;
  return storedPriceModel(row?.price_model, await getPriceModel());
}

export async function getQuoteByToken(token: string): Promise<StoredQuote | null> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const sql = requireDb();
  const [row] = await sql<QuoteRow[]>`${selectQuotes(sql, true)} where q.token = ${token}`;
  // Kundens offertsida: bara kundens prislista, aldrig återförsäljarens inköp.
  return row ? toQuote(row, await getPriceModel(), "customer") : null;
}

/**
 * Kundkontot bakom ordern som offerten bygger vidare på, när kunden bad om
 * fler skyltar med samma design från sin ordersida. Den nya ordern hör då
 * till samma konto. `null` för alla andra offerter.
 */
export async function reorderAccountId(quoteId: string): Promise<string | null> {
  const [row] = await requireDb()<{ account_id: string | null }[]>`
    select o.account_id from quotes q join orders o on o.id = q.reorder_of where q.id = ${quoteId}`;
  return row?.account_id ?? null;
}

export async function createQuote(input: {
  tenant: string;
  customerId: string;
  badges: BadgeDocument[];
  demo: boolean;
  badgeShot?: string | null;
  project?: string | null;
  /** Utelämnad = till kunden, som fyller i adressen när offerten godkänns. */
  delivery?: QuoteDelivery | null;
  /** Egna priser redan från början, till exempel butikens priser eller kundens rabatt. Utelämnad = listpris. */
  pricing?: Pricing | null;
  /** Ordern som kunden ville ha fler skyltar från. Offerten är då klar att godkänna direkt. */
  reorderOf?: { orderId: string; orderNo: string } | null;
  /** Hälsningen överst på offerten. */
  message?: string | null;
  /** Sista giltiga dag. Utelämnad = `QUOTE_VALID_DAYS` dagar från i dag. */
  validUntil?: string | null;
  /** Hur dokumentet ska se ut, till exempel utan säljarens logga. */
  options?: QuoteOptions | null;
  /** Bilderna ur 3D-vyn, en plats per design. */
  shots?: (QuoteShot | null)[] | null;
  /**
   * Säljaren skickar offerten själv, som PDF, och svarar åt kunden i panelen (knappen Offert i
   * skyltmotorn, beslut av ägaren 2026-11-19). Offerten väntar då på svar direkt, utan att mejlas härifrån.
   */
  manual?: boolean;
  /**
   * Offerten sparas som utkast, utan kund (besked via ägaren 2026-11-20): `customerId` är då säljarens
   * platshållare (`unassignedCustomerId`), och kunden väljs i panelen innan offerten skickas eller godkänns.
   */
  unassigned?: boolean;
}): Promise<{ quoteNo: string; token: string }> {
  const sql = requireDb();
  const model = await getPriceModel();
  const pricing = input.pricing && isCustomPricing(input.pricing) ? input.pricing : null;
  const price = priceWithPricing(input.badges, pricing, endPriceTable(model), shippingFor(model, input.badges, shippingMethodOf(input.delivery)));
  // En logga i färg sparas en gång; skyltarna pekar på den. En bild som saknas stoppar offerten.
  if (await missingLogoImages(input.badges)) throw new Error(MISSING_LOGO_IMAGE_ERROR);
  const badges = await withStoredLogoImages(input.badges);
  const validUntil = input.validUntil ?? addDays(swedishDay(new Date()), QUOTE_VALID_DAYS);
  const options = storedQuoteOptions(input.options);
  const shots = input.shots?.some(Boolean) ? input.shots : null;
  // En offert som kunden bad om, eller som säljaren skickar själv, väntar på svar från början.
  // Ett utkast utan kund väntar inte på svar: det har ingen kund som kan svara.
  const waiting = !input.unassigned && (Boolean(input.reorderOf) || Boolean(input.manual));
  const token = randomBytes(18).toString("base64url");
  return sql.begin(async (tx) => {
    // Kunden måste tillhöra samma återförsäljare — annars skapas ingen offert.
    const [row] = await tx<{ id: string; quote_no: string }[]>`
      insert into quotes (reseller_id, customer_id, badges, price_model, total_sek, total_incl_vat_sek, valid_until, token, is_demo, badge_shot, project,
                          delivery, pricing, reorder_of, status, sent_at, message, options, shots)
      select ${input.tenant}, ${input.customerId}, ${tx.json(badges as unknown as Json)}, ${tx.json(model as unknown as Json)}, ${price.totalSek},
             ${price.totalInclVatSek}, ${validUntil}, ${token}, ${input.demo}, ${input.badgeShot ?? null}, ${input.project ?? null},
             ${input.delivery ? tx.json(input.delivery as unknown as Json) : null},
             ${pricing ? tx.json(pricing as unknown as Json) : null}, ${input.reorderOf?.orderId ?? null},
             ${waiting ? "sent" : "draft"}, ${waiting ? tx`now()` : null}, ${input.message || null},
             ${options ? tx.json(options as unknown as Json) : null}, ${shots ? tx.json(shots as unknown as Json) : null}
       where exists (select 1 from customers where id = ${input.customerId} and reseller_id = ${input.tenant})
      returning id, quote_no`;
    if (!row) throw new Error("Offerten kunde inte sparas");
    if (input.reorderOf) {
      // Kunden har själv bett om fler skyltar från sin ordersida. Offerten går att godkänna direkt.
      await tx`insert into quote_events (quote_id, status, note)
               values (${row.id}, 'sent', ${`Kunden bad om fler skyltar med samma design som ${input.reorderOf.orderNo}`})`;
    } else if (input.unassigned) {
      await tx`insert into quote_events (quote_id, status, note)
               values (${row.id}, 'draft', 'Utkast sparat i skyltmotorn, utan kund. Kunden väljs innan offerten godkänns.')`;
    } else if (input.manual) {
      await tx`insert into quote_events (quote_id, status, note)
               values (${row.id}, 'sent', 'Offert sparad i skyltmotorn. Säljaren skickar PDF:en själv och svarar åt kunden.')`;
    } else {
      await tx`insert into quote_events (quote_id, status, note) values (${row.id}, 'draft', 'Offert skapad i skyltmotorn')`;
    }
    return { quoteNo: row.quote_no, token };
  });
}

async function addEvent(tx: TransactionSql, quoteId: string, status: QuoteStatus, note: string | null) {
  await tx`insert into quote_events (quote_id, status, note) values (${quoteId}, ${status}, ${note})`;
}

/**
 * Ger ett utkast utan kund sin kund. Bara en offert som pekar på säljarens platshållare ändras:
 * en offert som redan har en kund byter aldrig kund här. Offerten blir demo när kunden är det,
 * som när den skapas. `false` när offerten inte finns, redan har en kund eller är besvarad.
 */
export async function assignQuoteCustomer(tenant: string, quoteNo: string, customer: { id: string; demo: boolean }): Promise<boolean> {
  const sql = requireDb();
  return sql.begin(async (tx) => {
    const [row] = await tx<{ id: string; status: string }[]>`
      update quotes q set customer_id = ${customer.id}, is_demo = ${customer.demo}
       where q.quote_no = ${quoteNo} and q.reseller_id = ${tenant} and q.status in ('draft', 'sent', 'declined')
         and exists (select 1 from customers c where c.id = ${customer.id} and c.reseller_id = ${tenant})
         and exists (select 1 from customers p where p.id = q.customer_id and p.email = ${UNASSIGNED_CUSTOMER_EMAIL})
      returning q.id, q.status`;
    if (!row) return false;
    await addEvent(tx, row.id, isQuoteStatus(row.status) ? row.status : "draft", "Kund vald för offerten");
    return true;
  });
}

/** Nya priser och villkor. En nekad offert som ändras blir ett utkast igen. */
export async function updateQuote(
  tenant: string,
  quoteNo: string,
  patch: { pricing?: Pricing; message?: string | null; validUntil?: string; project?: string | null },
): Promise<boolean> {
  const sql = requireDb();
  const currentModel = await getPriceModel();
  return sql.begin(async (tx) => {
    const [row] = await tx<{ id: string; badges: unknown; status: string; pricing: unknown; price_model: unknown; delivery: unknown }[]>`
      select id, badges, status, pricing, price_model, delivery from quotes where quote_no = ${quoteNo} and reseller_id = ${tenant} for update`;
    const badges = badgesSchema.safeParse(row?.badges);
    if (!row || !badges.success || !["draft", "sent", "declined"].includes(row.status)) return false;
    const pricing = patch.pricing !== undefined ? (isCustomPricing(patch.pricing) ? patch.pricing : null) : parsePricing(row.pricing);
    const model = storedPriceModel(row.price_model, currentModel);
    const method = shippingMethodOf(parseQuoteDelivery(row.delivery));
    const price = priceWithPricing(badges.data, pricing, endPriceTable(model), shippingFor(model, badges.data, method));
    const status: QuoteStatus = row.status === "declined" ? "draft" : (row.status as QuoteStatus);
    await tx`
      update quotes set pricing = ${pricing ? tx.json(pricing as unknown as Json) : null},
             total_sek = ${price.totalSek}, total_incl_vat_sek = ${price.totalInclVatSek},
             message = ${patch.message === undefined ? tx`message` : patch.message},
             valid_until = ${patch.validUntil ?? tx`valid_until`},
             project = ${patch.project === undefined ? tx`project` : patch.project},
             status = ${status}
       where id = ${row.id}`;
    if (patch.pricing !== undefined) {
      await addEvent(tx, row.id, status, pricing ? `Pris ${price.totalSek} kr exkl. moms` : "Listpris");
    }
    return true;
  });
}

/**
 * Vart och hur offertens skyltar ska skickas. Går att ändra tills offerten är
 * besvarad. Frakten följer fraktsättet, så summan räknas om.
 */
export async function updateQuoteDelivery(tenant: string, quoteNo: string, delivery: QuoteDelivery): Promise<boolean> {
  const sql = requireDb();
  const parsed = quoteDeliverySchema.parse(delivery);
  const currentModel = await getPriceModel();
  return sql.begin(async (tx) => {
    const [row] = await tx<{ id: string; badges: unknown; pricing: unknown; price_model: unknown }[]>`
      select id, badges, pricing, price_model from quotes
       where quote_no = ${quoteNo} and reseller_id = ${tenant} and status in ('draft', 'sent', 'declined') for update`;
    if (!row) return false;
    const badges = badgesSchema.safeParse(row.badges);
    const model = storedPriceModel(row.price_model, currentModel);
    const price = badges.success
      ? priceWithPricing(badges.data, parsePricing(row.pricing), endPriceTable(model), shippingFor(model, badges.data, shippingMethodOf(parsed)))
      : null;
    await tx`
      update quotes set delivery = ${tx.json(parsed as unknown as Json)},
             total_sek = ${price ? price.totalSek : tx`total_sek`},
             total_incl_vat_sek = ${price ? price.totalInclVatSek : tx`total_incl_vat_sek`}
       where id = ${row.id}`;
    return true;
  });
}

/** Leveransen som gällde när offerten blev en order. Sparas på offerten så att den visar vart skyltarna gick. */
export async function saveAcceptedDelivery(quoteId: string, delivery: QuoteDelivery): Promise<void> {
  const sql = requireDb();
  const parsed = quoteDeliverySchema.parse(delivery);
  const currentModel = await getPriceModel();
  await sql.begin(async (tx) => {
    const [row] = await tx<{ badges: unknown; pricing: unknown; price_model: unknown }[]>`
      select badges, pricing, price_model from quotes where id = ${quoteId} for update`;
    const badges = badgesSchema.safeParse(row?.badges);
    const model = storedPriceModel(row?.price_model, currentModel);
    // Kunden kan ha valt ett annat leveranssätt än det som stod på offerten, och då är frakten en annan.
    const price = badges.success
      ? priceWithPricing(badges.data, parsePricing(row?.pricing), endPriceTable(model), shippingFor(model, badges.data, shippingMethodOf(parsed)))
      : null;
    await tx`
      update quotes set delivery = ${tx.json(parsed as unknown as Json)},
             total_sek = ${price ? price.totalSek : tx`total_sek`},
             total_incl_vat_sek = ${price ? price.totalInclVatSek : tx`total_incl_vat_sek`}
       where id = ${quoteId}`;
  });
}

export async function markSent(tenant: string, quoteNo: string): Promise<StoredQuote | null> {
  const sql = requireDb();
  const updated = await sql.begin(async (tx) => {
    const [row] = await tx<{ id: string }[]>`
      update quotes set status = 'sent', sent_at = now(), decided_at = null, decline_reason = null
       where quote_no = ${quoteNo} and reseller_id = ${tenant} and status in ('draft', 'sent', 'declined')
      returning id`;
    if (!row) return false;
    await addEvent(tx, row.id, "sent", "Offerten skickad till kunden");
    return true;
  });
  return updated ? getQuote(tenant, quoteNo) : null;
}

/** Offerten har mejlats till kunden: tiden sparas, och utskicket syns i offertens tidslinje. */
export async function markEmailed(quoteId: string): Promise<void> {
  await requireDb().begin(async (tx) => {
    await tx`update quotes set emailed_at = now() where id = ${quoteId}`;
    await addEvent(tx, quoteId, "sent", "Offerten mejlad till kunden");
  });
}

/**
 * Låser offerten som godkänd innan ordern läggs, så att två klick inte ger två
 * ordrar. Misslyckas ordern släpps låset igen.
 */
export async function claimForAcceptance(tenant: string, quoteNo: string, allowDraft: boolean): Promise<StoredQuote | null> {
  const sql = requireDb();
  const statuses = allowDraft ? ["draft", "sent", "declined"] : ["sent"];
  const [row] = await sql<{ id: string }[]>`
    update quotes set status = 'accepted', decided_at = now()
     where quote_no = ${quoteNo} and reseller_id = ${tenant} and status in ${sql(statuses)}
       and (${allowDraft} or valid_until >= ${swedishDay(new Date())})
    returning id`;
  return row ? getQuote(tenant, quoteNo) : null;
}

export async function releaseAcceptance(quoteId: string, previous: QuoteStatus): Promise<void> {
  const sql = requireDb();
  await sql`update quotes set status = ${previous}, decided_at = null where id = ${quoteId}`;
}

export async function completeAcceptance(quoteId: string, orderNo: string, note: string): Promise<void> {
  const sql = requireDb();
  await sql.begin(async (tx) => {
    await tx`update quotes set order_id = (select id from orders where order_no = ${orderNo}) where id = ${quoteId}`;
    await addEvent(tx, quoteId, "accepted", `${note} · order ${orderNo}`);
  });
}

export async function declineQuote(token: string, reason: string | null): Promise<boolean> {
  const sql = requireDb();
  return sql.begin(async (tx) => {
    const [row] = await tx<{ id: string }[]>`
      update quotes set status = 'declined', decided_at = now(), decline_reason = ${reason}
       where token = ${token} and status = 'sent'
      returning id`;
    if (!row) return false;
    await addEvent(tx, row.id, "declined", reason ? `Kunden tackade nej: ${reason}` : "Kunden tackade nej");
    return true;
  });
}

/**
 * Säljaren nekar offerten åt kunden, som har svarat nej utanför sajten (beslut av ägaren 2026-11-19:
 * panelen ska ha Godkänn och Neka). Går från utkast eller skickad. Offerten finns kvar och kan ändras
 * och skickas igen, till skillnad från en makulerad.
 */
export async function declineQuoteForCustomer(tenant: string, quoteNo: string): Promise<boolean> {
  const sql = requireDb();
  return sql.begin(async (tx) => {
    const [row] = await tx<{ id: string }[]>`
      update quotes set status = 'declined', decided_at = now(), decline_reason = null
       where quote_no = ${quoteNo} and reseller_id = ${tenant} and status in ('draft', 'sent')
      returning id`;
    if (!row) return false;
    await addEvent(tx, row.id, "declined", "Kunden tackade nej. Nekad av säljaren åt kunden.");
    return true;
  });
}

/**
 * Tar bort offerten för gott, med sin historik och sina besked (besked via ägaren 2026-11-20:
 * offerter ska gå att ta bort i panelen). En offert som har blivit en order behålls: den är
 * orderns underlag. Det gäller också en offert som just godkänns, eftersom den låses som
 * godkänd innan ordern läggs. `false` när offerten inte finns eller har blivit en order.
 */
export async function deleteQuote(tenant: string, quoteNo: string): Promise<boolean> {
  const rows = await requireDb()<{ id: string }[]>`
    delete from quotes where quote_no = ${quoteNo} and reseller_id = ${tenant} and status <> 'accepted' returning id`;
  return rows.length > 0;
}

export async function cancelQuote(tenant: string, quoteNo: string): Promise<boolean> {
  const sql = requireDb();
  return sql.begin(async (tx) => {
    const [row] = await tx<{ id: string }[]>`
      update quotes set status = 'cancelled'
       where quote_no = ${quoteNo} and reseller_id = ${tenant} and status in ('draft', 'sent', 'declined')
      returning id`;
    if (!row) return false;
    await addEvent(tx, row.id, "cancelled", "Offerten makulerad");
    return true;
  });
}
