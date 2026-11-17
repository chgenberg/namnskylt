import "server-only";
import { randomBytes } from "node:crypto";
import type { Sql, TransactionSql } from "postgres";
import { z } from "zod";
import { badgeDocumentSchema, sameDesign, type BadgeDocument } from "@/engine";
import { endPriceTable, type PriceModel } from "@/engine/price-model";
import { DEFAULT_PRICE_MODEL } from "@/engine/default-price-model";
import { db, requireDb } from "@/lib/db/client";
import { withStoredLogoImages } from "@/lib/logo-images/repository";
import { parsePayment, type OrderPayment } from "@/lib/payments/model";
import {
  deliveryAddressSchema,
  deliverySchema,
  parseDelivery,
  SHIPPING_METHOD_LABEL,
  shippingMethodOf,
  type Delivery,
  type DeliveryAddress,
} from "./delivery";
import { priceListsFor, shippingFor, storedPriceModel, type PriceAudience } from "./price-lists";
import { isCustomPricing, isLineInvoiceable, parsePricing, priceWithPricing, type Pricing } from "./pricing";
import { companyProfileSchema, DEFAULT_COMPANY, type CompanyProfile } from "@/lib/company/profile";
import { isOwner, OWNER_TENANT, settingsKey } from "@/lib/tenants/model";
import {
  isOrderSource,
  isOrderStatus,
  type Customer,
  type OrderEvent,
  type OrderSource,
  type OrderStatus,
  type StoredOrder,
  isDirectOrder,
} from "./model";

const badgesSchema = z.array(badgeDocumentSchema);

interface OrderRow {
  id: string;
  order_no: string;
  status: string;
  badges: unknown;
  pricing: unknown;
  price_model: unknown;
  total_sek: number;
  total_incl_vat_sek: number;
  supplier_order_no: string | null;
  partner_request_no: string | null;
  tracking_url: string | null;
  source: string;
  repeat_of_order_no: string | null;
  placed_at: Date;
  supplier_synced_at: Date | null;
  has_badge_shot: boolean;
  shop_slug: string | null;
  project: string | null;
  reseller_id: string;
  customer_id: string;
  customer_name: string;
  customer_company: string | null;
  customer_email: string;
  customer_phone: string | null;
  customer_org_number: string | null;
  customer_address: string | null;
  customer_demo: boolean;
  is_demo: boolean;
  delivery: unknown;
  supplier_sent_at: Date | null;
  supplier_error: string | null;
  supplier_attempts: number;
  payment: unknown;
  express_shipping_sek: number | null;
  customer_token: string;
  events: { status: string; note: string | null; at: string }[] | null;
}

/** Databasen är inte klientdata, men validera ändå — ett trasigt dokument får inte nå produktionen. */
function toOrder(row: OrderRow, currentModel: PriceModel, audience: PriceAudience): StoredOrder {
  const badges = badgesSchema.safeParse(row.badges);
  if (!badges.success) console.error(`Ogiltiga skyltar i order ${row.order_no}`);
  const events: OrderEvent[] = (row.events ?? [])
    .filter((e): e is OrderEvent => isOrderStatus(e.status))
    .map((e) => ({ status: e.status, note: e.note, at: new Date(e.at).toISOString() }));
  return {
    id: row.id,
    orderNo: row.order_no,
    customer: {
      id: row.customer_id,
      name: row.customer_name,
      company: row.customer_company,
      email: row.customer_email,
      phone: row.customer_phone,
      orgNumber: row.customer_org_number,
      address: row.customer_address,
      demo: row.customer_demo,
    },
    status: isOrderStatus(row.status) ? row.status : "received",
    badges: badges.success ? badges.data : [],
    pricing: parsePricing(row.pricing),
    ...priceListsFor(
      row.price_model,
      currentModel,
      audience,
      badges.success ? badges.data : [],
      shippingMethodOf(parseDelivery(row.delivery)),
      row.express_shipping_sek,
    ),
    totalSek: row.total_sek,
    totalInclVatSek: row.total_incl_vat_sek,
    supplierOrderNo: row.supplier_order_no,
    partnerRequestNo: row.partner_request_no,
    trackingUrl: row.tracking_url,
    source: isOrderSource(row.source) ? row.source : "web",
    repeatOfOrderNo: row.repeat_of_order_no,
    placedAt: row.placed_at.toISOString(),
    events,
    supplierSyncedAt: row.supplier_synced_at?.toISOString() ?? null,
    hasBadgeShot: row.has_badge_shot,
    shopSlug: row.shop_slug,
    project: row.project,
    resellerId: row.reseller_id,
    demo: row.is_demo,
    delivery: parseDelivery(row.delivery),
    supplierSentAt: row.supplier_sent_at?.toISOString() ?? null,
    supplierError: row.supplier_error,
    supplierAttempts: row.supplier_attempts,
    payment: parsePayment(row.payment),
    expressShippingSek: row.express_shipping_sek,
    customerToken: row.customer_token,
  };
}

/** Kundens kolumner som ett `Customer` — samma urval överallt. */
const CUSTOMER_COLUMNS = "id, name, company, email, phone, org_number as \"orgNumber\", address, is_demo as demo";

type Json = Parameters<Sql["json"]>[0];

function selectOrders(sql: Sql) {
  return sql`
    select o.id, o.order_no, o.status, o.badges, o.pricing, o.price_model, o.total_sek, o.total_incl_vat_sek,
           o.supplier_order_no, o.partner_request_no, o.tracking_url, o.source, o.placed_at, o.is_demo, o.supplier_synced_at,
           o.badge_shot is not null as has_badge_shot, o.shop_slug, o.project, o.reseller_id,
           o.delivery, o.supplier_sent_at, o.supplier_error, o.supplier_attempts, o.payment, o.express_shipping_sek, o.customer_token,
           r.order_no as repeat_of_order_no,
           c.id as customer_id, c.name as customer_name, c.company as customer_company, c.email as customer_email, c.is_demo as customer_demo,
           c.phone as customer_phone, c.org_number as customer_org_number, c.address as customer_address,
           (select json_agg(json_build_object('status', e.status, 'note', e.note, 'at', e.at) order by e.at)
              from order_events e where e.order_id = o.id) as events
      from orders o
      join customers c on c.id = o.customer_id
      left join orders r on r.id = o.repeat_of
  `;
}

export function databaseConfigured(): boolean {
  return db() !== null;
}

export async function listOrders(tenant: string): Promise<StoredOrder[]> {
  const sql = requireDb();
  const rows = await sql<OrderRow[]>`${selectOrders(sql)} where o.reseller_id = ${tenant} order by o.placed_at desc`;
  const model = await getPriceModel();
  return rows.map((row) => toOrder(row, model, "reseller"));
}

export async function getOrder(tenant: string, orderNo: string): Promise<StoredOrder | null> {
  const sql = requireDb();
  const [row] = await sql<OrderRow[]>`${selectOrders(sql)} where o.order_no = ${orderNo} and o.reseller_id = ${tenant}`;
  return row ? toOrder(row, await getPriceModel(), "reseller") : null;
}

/** Adressen till kundens ordersida för ett ordernummer; `null` när ordern inte finns. */
export async function customerOrderPath(orderNo: string): Promise<string | null> {
  const [row] = await requireDb()<{ customer_token: string }[]>`select customer_token from orders where order_no = ${orderNo}`;
  return row ? `/order/${row.customer_token}` : null;
}

/** Koden i länken till kundens ordersida: 64 hex-tecken, olika för varje order. */
export const CUSTOMER_TOKEN_PATTERN = /^[0-9a-f]{64}$/;

/** Ordern bakom kundens hemliga länk, läst åt kunden: aldrig med inköpspriser. */
export async function getOrderByCustomerToken(token: string): Promise<StoredOrder | null> {
  if (!CUSTOMER_TOKEN_PATTERN.test(token)) return null;
  const sql = requireDb();
  const [row] = await sql<OrderRow[]>`${selectOrders(sql)} where o.customer_token = ${token}`;
  return row ? toOrder(row, await getPriceModel(), "customer") : null;
}

/** Utan hyresgäst — bara för kundens egna länkar (korrektur), där token är behörigheten. */
async function getOrderAnyTenant(orderNo: string): Promise<StoredOrder | null> {
  const sql = requireDb();
  const [row] = await sql<OrderRow[]>`${selectOrders(sql)} where o.order_no = ${orderNo}`;
  return row ? toOrder(row, await getPriceModel(), "customer") : null;
}

/**
 * En order oavsett återförsäljare, med inköpspriserna. Bara för servern själv
 * (orderns väg till verkstaden) och för adminens översikt, aldrig för en
 * återförsäljares eller kunds sida.
 */
export async function getOrderForDispatch(orderNo: string): Promise<StoredOrder | null> {
  const sql = requireDb();
  const [row] = await sql<OrderRow[]>`${selectOrders(sql)} where o.order_no = ${orderNo}`;
  return row ? toOrder(row, await getPriceModel(), "reseller") : null;
}

export interface DispatchOrder {
  order: StoredOrder;
  /** Återförsäljarens namn; namnskylt.com för ägarens egna ordrar. */
  resellerName: string;
}

/**
 * De senaste ordrarna hos alla återförsäljare, nyast först, utan demoordrar.
 * Bara för adminens översikt över vad som ska till verkstaden.
 */
export async function listOrdersForDispatch(limit = 300): Promise<DispatchOrder[]> {
  const sql = requireDb();
  const rows = await sql<(OrderRow & { reseller_name: string | null })[]>`
    select orders.*, a.name as reseller_name
      from (${selectOrders(sql)} where not o.is_demo order by o.placed_at desc limit ${limit}) orders
      left join reseller_accounts a on a.id = orders.reseller_id
     order by orders.placed_at desc`;
  const model = await getPriceModel();
  return rows.map((row) => ({
    order: toOrder(row, model, "reseller"),
    resellerName: row.reseller_name ?? (isOwner(row.reseller_id) ? "namnskylt.com" : row.reseller_id),
  }));
}

/** Hela prismodellen ordern sparades med. Bara för servern. */
export async function orderPriceModel(orderId: string): Promise<PriceModel> {
  const sql = requireDb();
  const [row] = await sql<{ price_model: unknown }[]>`select price_model from orders where id = ${orderId}`;
  return storedPriceModel(row?.price_model, await getPriceModel());
}

export async function listCustomerOrders(tenant: string, customerId: string): Promise<StoredOrder[]> {
  const sql = requireDb();
  const rows = await sql<OrderRow[]>`${selectOrders(sql)}
    where o.customer_id = ${customerId} and o.reseller_id = ${tenant} order by o.placed_at desc`;
  const model = await getPriceModel();
  return rows.map((row) => toOrder(row, model, "reseller"));
}

/** Ordrarna som lades av ett inloggat kundkonto, nyast först, lästa åt kunden: aldrig med inköpspriser. */
export async function listAccountOrders(accountId: string): Promise<StoredOrder[]> {
  const sql = requireDb();
  const rows = await sql<OrderRow[]>`${selectOrders(sql)} where o.account_id = ${accountId} order by o.placed_at desc limit 200`;
  const model = await getPriceModel();
  return rows.map((row) => toOrder(row, model, "customer"));
}

/** En av kontots ordrar, läst åt kunden. `null` när ordern inte hör till kontot. */
export async function getAccountOrder(accountId: string, orderNo: string): Promise<StoredOrder | null> {
  const sql = requireDb();
  const [row] = await sql<OrderRow[]>`${selectOrders(sql)} where o.account_id = ${accountId} and o.order_no = ${orderNo}`;
  return row ? toOrder(row, await getPriceModel(), "customer") : null;
}

/**
 * Lägger en order på ett kundkonto som skapades i samma kassa. Bara en order
 * utan konto flyttas, så att en order aldrig byter ägare.
 */
export async function attachOrderToAccount(accountId: string, orderNo: string): Promise<boolean> {
  const rows = await requireDb()`
    update orders set account_id = ${accountId} where order_no = ${orderNo} and account_id is null returning id`;
  return rows.length > 0;
}

export interface NewOrder {
  customer: { name: string; email: string; company?: string | null; orgNumber?: string | null };
  badges: BadgeDocument[];
  status: OrderStatus;
  source: OrderSource;
  repeatOf?: string | null;
  supplierOrderNo?: string | null;
  partnerRequestNo?: string | null;
  note?: string | null;
  placedAt?: string;
  demo?: boolean;
  pricing?: Pricing | null;
  /** Modellen ordern prissätts med; utelämnad = dagens. En godkänd offert skickar med sin egen. */
  priceModel?: PriceModel;
  badgeShot?: string | null;
  shopSlug?: string | null;
  project?: string | null;
  /** Vart skyltarna skickas. Utan leverans sparas ordern, men den går inte att skicka till verkstaden. */
  delivery?: Delivery | null;
  /** Betalningen, när ordern är betald med kort. Utelämnad = faktura. */
  payment?: OrderPayment | null;
  /** Kundkontot som var inloggat när ordern lades. Ordern visas då på kundens sida. */
  accountId?: string | null;
  /** Återförsäljaren ordern tillhör; webbshoppen och butikerna är ägarens. */
  tenant: string;
}

/** Sparar ordern, kopplar den till kunden (samma e-post = samma kund) och loggar första steget. */
export async function createOrder(order: NewOrder): Promise<{ id: string; orderNo: string; customerToken: string }> {
  const sql = requireDb();
  const pricing = isCustomPricing(order.pricing ?? null) ? (order.pricing ?? null) : null;
  const model = order.priceModel ?? (await getPriceModel());
  const price = priceWithPricing(order.badges, pricing, endPriceTable(model), shippingFor(model, order.badges, shippingMethodOf(order.delivery)));
  // En logga i färg sparas en gång; skyltarna pekar på den.
  const badges = await withStoredLogoImages(order.badges);
  const email = order.customer.email.trim().toLowerCase();
  const placedAt = order.placedAt ? new Date(order.placedAt) : new Date();
  const tenant = order.tenant;
  return sql.begin(async (tx) => {
    const [customer] = await tx<{ id: string }[]>`
      insert into customers (reseller_id, email, name, company, org_number, is_demo)
      values (${tenant}, ${email}, ${order.customer.name}, ${order.customer.company ?? null}, ${order.customer.orgNumber ?? null}, ${order.demo ?? false})
      on conflict (reseller_id, email) do update
        set name = excluded.name, company = coalesce(excluded.company, customers.company),
            org_number = coalesce(excluded.org_number, customers.org_number)
      returning id`;
    if (!customer) throw new Error("Kunden kunde inte sparas");
    const [saved] = await tx<{ id: string; order_no: string; customer_token: string }[]>`
      insert into orders (customer_id, status, badges, pricing, price_model, total_sek, total_incl_vat_sek,
                          supplier_order_no, partner_request_no, source, repeat_of, placed_at, is_demo, badge_shot, shop_slug, reseller_id, project,
                          delivery, payment, account_id)
      values (${customer.id}, ${order.status}, ${tx.json(badges as unknown as Json)},
              ${pricing ? tx.json(pricing as unknown as Json) : null}, ${tx.json(model as unknown as Json)},
              ${price.totalSek}, ${price.totalInclVatSek}, ${order.supplierOrderNo ?? null},
              ${order.partnerRequestNo ?? null}, ${order.source}, ${order.repeatOf ?? null}, ${placedAt}, ${order.demo ?? false},
              ${order.badgeShot ?? null}, ${order.shopSlug ?? null}, ${tenant}, ${order.project ?? null},
              ${order.delivery ? tx.json(order.delivery as unknown as Json) : null},
              ${order.payment ? tx.json(order.payment as unknown as Json) : null},
              -- Ett konto som hann tas bort får aldrig stoppa ordern: då sparas den utan konto.
              (select id from customer_accounts where id = ${order.accountId ?? null}))
      returning id, order_no, customer_token`;
    if (!saved) throw new Error("Ordern kunde inte sparas");
    await tx`insert into order_events (order_id, status, note, at) values (${saved.id}, ${order.status}, ${order.note ?? null}, ${placedAt})`;
    return { id: saved.id, orderNo: saved.order_no, customerToken: saved.customer_token };
  });
}

/**
 * Tar bort ordern för gott. Kopior och offerter som pekar hit behålls men
 * tappar länken; tidslinje och korrektur följer med ordern.
 */
export async function deleteOrder(tenant: string, orderNo: string): Promise<boolean> {
  const sql = requireDb();
  return sql.begin(async (tx) => {
    const [order] = await tx<{ id: string }[]>`
      select id from orders where order_no = ${orderNo} and reseller_id = ${tenant} for update`;
    if (!order) return false;
    await tx`update orders set repeat_of = null where repeat_of = ${order.id}`;
    await tx`update quotes set order_id = null where order_id = ${order.id}`;
    await tx`delete from orders where id = ${order.id}`;
    return true;
  });
}

export type ShotKind = "order" | "quote";

export interface MissingShot {
  kind: ShotKind;
  id: string;
  badge: BadgeDocument;
}

/** Ordrar och offerter från innan stillbilderna fanns — panelen ritar dem i efterhand. */
export async function missingBadgeShots(tenant: string, limit: number): Promise<MissingShot[]> {
  const sql = requireDb();
  // Fler rader än som behövs: de med flera designer hoppas över och ska inte ta platsen för de andra.
  const rows = await sql<{ kind: ShotKind; id: string; badges: unknown }[]>`
    (select 'order' as kind, order_no as id, badges, placed_at as at from orders
      where badge_shot is null and jsonb_array_length(badges) > 0 and reseller_id = ${tenant})
    union all
    (select 'quote', quote_no, badges, created_at from quotes
      where badge_shot is null and jsonb_array_length(badges) > 0 and reseller_id = ${tenant})
    order by at desc limit ${limit * 4}`;
  return rows
    .flatMap((row) => {
      const badges = badgesSchema.safeParse(row.badges);
      const first = badges.success ? badges.data[0] : undefined;
      // Bilden visar första skylten. I en order med flera designer vore den missvisande, så där visas ritningarna.
      return first && badges.success && sameDesign(badges.data) ? [{ kind: row.kind, id: row.id, badge: first }] : [];
    })
    .slice(0, limit);
}

/** Sparar bara där bilden saknas — en riktig bild från skyltmotorn skrivs aldrig över. */
export async function saveMissingBadgeShot(tenant: string, kind: ShotKind, id: string, shot: string): Promise<boolean> {
  const sql = requireDb();
  const rows =
    kind === "order"
      ? await sql`update orders set badge_shot = ${shot}
                   where order_no = ${id} and reseller_id = ${tenant} and badge_shot is null returning 1`
      : await sql`update quotes set badge_shot = ${shot}
                   where quote_no = ${id} and reseller_id = ${tenant} and badge_shot is null returning 1`;
  return rows.length > 0;
}

export async function getBadgeShot(tenant: string, orderNo: string): Promise<string | null> {
  const sql = requireDb();
  const [row] = await sql<{ badge_shot: string | null }[]>`
    select badge_shot from orders where order_no = ${orderNo} and reseller_id = ${tenant}`;
  return row?.badge_shot ?? null;
}

const PRICE_MODEL_KEY = "price_model";

/**
 * Prismodellen som gäller nu. En och samma för alla återförsäljare; kalkylens siffror tills något sparats.
 * Hela modellen innehåller provisionen — skicka aldrig vidare den till en klientkomponent, bara prislistor ur den.
 */
export async function getPriceModel(): Promise<PriceModel> {
  const sql = db();
  if (!sql) return DEFAULT_PRICE_MODEL;
  const [row] = await sql<{ value: unknown }[]>`select value from settings where key = ${settingsKey(OWNER_TENANT, PRICE_MODEL_KEY)}`;
  return storedPriceModel(row?.value, DEFAULT_PRICE_MODEL);
}

/** Dagens modell, eller kalkylens siffror när databasen inte svarar — sajten ska gå att visa ändå. */
export async function priceModelOrDefault(): Promise<PriceModel> {
  try {
    return await getPriceModel();
  } catch (error) {
    console.error("Prismodellen gick inte att läsa", error);
    return DEFAULT_PRICE_MODEL;
  }
}

export async function savePriceModel(model: PriceModel): Promise<void> {
  const sql = requireDb();
  await sql`
    insert into settings (key, value) values (${settingsKey(OWNER_TENANT, PRICE_MODEL_KEY)}, ${sql.json(model as unknown as Json)})
    on conflict (key) do update set value = excluded.value, updated_at = now()`;
}

const COMPANY_PROFILE_KEY = "company_profile";

/** Återförsäljarens uppgifter; standarduppgifterna tills något sparats eller utan databas. */
export async function getCompanyProfile(tenant: string): Promise<CompanyProfile> {
  if (!databaseConfigured()) return DEFAULT_COMPANY;
  const sql = requireDb();
  const [row] = await sql<{ value: unknown }[]>`select value from settings where key = ${settingsKey(tenant, COMPANY_PROFILE_KEY)}`;
  const parsed = companyProfileSchema.safeParse(row?.value);
  if (parsed.success) return parsed.data;
  if (isOwner(tenant)) return DEFAULT_COMPANY;
  // En ny återförsäljare börjar med sitt namn och tomma uppgifter — aldrig med namnskylt.coms.
  const [account] = await sql<{ name: string }[]>`select name from reseller_accounts where id = ${tenant}`;
  return { ...DEFAULT_COMPANY, name: account?.name ?? tenant, tagline: "", website: "" };
}

export async function saveCompanyProfile(tenant: string, profile: CompanyProfile): Promise<void> {
  const sql = requireDb();
  await sql`
    insert into settings (key, value) values (${settingsKey(tenant, COMPANY_PROFILE_KEY)}, ${sql.json(profile as unknown as Json)})
    on conflict (key) do update set value = excluded.value, updated_at = now()`;
}

export interface SupplierUpdate {
  status: OrderStatus | null;
  trackingUrl?: string | null;
  /** Expressfraktens pris i hela kronor, exklusive moms, när verkstaden har satt det. */
  expressShippingSek?: number | null;
  at: string;
}

export interface SupplierUpdateResult {
  found: boolean;
  /** Statusen flyttades framåt. */
  changed: boolean;
  /** Ordern och statusen den fick, när den ändrades. */
  orderNo?: string;
  status?: OrderStatus;
}

/**
 * Sätter expressfraktens pris på en order och räknar om summan. Gäller bara en
 * order med expressfrakt. `false` när ordern har ett annat fraktsätt eller
 * priset redan är detsamma.
 */
async function applyExpressPrice(tx: TransactionSql, orderId: string, sek: number, currentModel: PriceModel, who: string): Promise<boolean> {
  const [row] = await tx<{ status: string; badges: unknown; pricing: unknown; price_model: unknown; delivery: unknown; express_shipping_sek: number | null }[]>`
    select status, badges, pricing, price_model, delivery, express_shipping_sek from orders where id = ${orderId} for update`;
  if (!row || shippingMethodOf(parseDelivery(row.delivery)) !== "express" || row.express_shipping_sek === sek) return false;
  const badges = badgesSchema.safeParse(row.badges);
  if (!badges.success) return false;
  const model = storedPriceModel(row.price_model, currentModel);
  const price = priceWithPricing(badges.data, parsePricing(row.pricing), endPriceTable(model), sek);
  await tx`
    update orders set express_shipping_sek = ${sek}, total_sek = ${price.totalSek}, total_incl_vat_sek = ${price.totalInclVatSek}
     where id = ${orderId}`;
  await tx`insert into order_events (order_id, status, note) values (${orderId}, ${row.status}, ${`Expressfrakt ${sek} kr, ${who}`})`;
  return true;
}

/**
 * Admin sätter expressfraktens pris för hand, tills verkstadens system skickar
 * det själv. Gäller alla återförsäljares ordrar: anroparen ansvarar för att
 * bara admin når hit.
 */
export async function setExpressShipping(orderNo: string, sek: number): Promise<boolean> {
  const sql = requireDb();
  const currentModel = await getPriceModel();
  return sql.begin(async (tx) => {
    const [order] = await tx<{ id: string }[]>`select id from orders where order_no = ${orderNo} and not is_demo for update`;
    return order ? applyExpressPrice(tx, order.id, sek, currentModel, "satt av namnskylt.com") : false;
  });
}

/**
 * Leverantörens läge för en order. Statusen flyttas bara framåt (`canAdvance`
 * avgör), spårningslänken och expressfraktens pris fylls på och
 * avstämningstiden sparas oavsett.
 */
export async function applySupplierUpdate(
  supplierOrderNo: string,
  update: SupplierUpdate,
  canAdvance: (current: OrderStatus, next: OrderStatus) => boolean,
): Promise<SupplierUpdateResult> {
  const sql = requireDb();
  const currentModel = await getPriceModel();
  return sql.begin(async (tx) => {
    const [order] = await tx<{ id: string; order_no: string; status: string }[]>`
      select id, order_no, status from orders
       where supplier_order_no = ${supplierOrderNo} and not is_demo
       for update`;
    if (!order) return { found: false, changed: false };
    const current = isOrderStatus(order.status) ? order.status : "received";
    const next = update.status && canAdvance(current, update.status) ? update.status : null;
    await tx`
      update orders set status = ${next ?? current},
             tracking_url = coalesce(${update.trackingUrl ?? null}, tracking_url),
             supplier_synced_at = now()
       where id = ${order.id}`;
    if (next) {
      await tx`insert into order_events (order_id, status, note, at)
               values (${order.id}, ${next}, ${"Från tryckeriet"}, ${new Date(update.at)})`;
    }
    if (update.expressShippingSek != null) {
      await applyExpressPrice(tx, order.id, update.expressShippingSek, currentModel, "satt av verkstaden");
    }
    return next ? { found: true, changed: true, orderNo: order.order_no, status: next } : { found: true, changed: false };
  });
}

/**
 * Ny leverans på en order: adress, mottagare eller fraktsätt. Går bara medan
 * ordern väntar på att skickas till verkstaden; därefter är leveransen deras.
 * Frakten följer fraktsättet, så summan räknas om.
 */
export async function updateOrderDelivery(tenant: string, orderNo: string, delivery: Delivery): Promise<boolean> {
  const sql = requireDb();
  const parsed = deliverySchema.parse(delivery);
  const currentModel = await getPriceModel();
  return sql.begin(async (tx) => {
    const [row] = await tx<{ id: string; status: string; badges: unknown; pricing: unknown; price_model: unknown; express_shipping_sek: number | null }[]>`
      select id, status, badges, pricing, price_model, express_shipping_sek from orders
       where order_no = ${orderNo} and reseller_id = ${tenant} and supplier_sent_at is null for update`;
    if (!row) return false;
    const badges = badgesSchema.safeParse(row.badges);
    const model = storedPriceModel(row.price_model, currentModel);
    const method = shippingMethodOf(parsed);
    // Expressfraktens pris hör till expressfrakten: med ett annat fraktsätt gäller det inte längre.
    const expressSek = method === "express" ? row.express_shipping_sek : null;
    const price = badges.success
      ? priceWithPricing(badges.data, parsePricing(row.pricing), endPriceTable(model), shippingFor(model, badges.data, method, expressSek))
      : null;
    await tx`
      update orders set delivery = ${tx.json(parsed as unknown as Json)}, express_shipping_sek = ${expressSek},
             total_sek = ${price ? price.totalSek : tx`total_sek`},
             total_incl_vat_sek = ${price ? price.totalInclVatSek : tx`total_incl_vat_sek`}
       where id = ${row.id}`;
    const how = method === "standard" ? "" : `${SHIPPING_METHOD_LABEL[method]}, `;
    await tx`insert into order_events (order_id, status, note)
             values (${row.id}, ${row.status}, ${`Leverans: ${how}${parsed.address.zip} ${parsed.address.city}`})`;
    return true;
  });
}

/**
 * Tar ordern för ett försök att skicka den till verkstaden. Bara ett försök åt
 * gången: ett pågående försök håller ordern i två minuter. `false` när ordern
 * redan är skickad, är en demoorder eller just nu skickas av någon annan.
 */
export async function claimForDispatch(orderId: string): Promise<boolean> {
  const sql = requireDb();
  const [row] = await sql<{ id: string }[]>`
    update orders set supplier_claimed_at = now(), supplier_attempts = supplier_attempts + 1
     where id = ${orderId} and supplier_sent_at is null and not is_demo and status <> 'cancelled'
       and (supplier_claimed_at is null or supplier_claimed_at < now() - interval '2 minutes')
    returning id`;
  return Boolean(row);
}

/** Verkstaden har tagit emot ordern. */
export async function markDispatched(orderId: string, supplierOrderNo: string): Promise<void> {
  const sql = requireDb();
  await sql.begin(async (tx) => {
    const [row] = await tx<{ status: string }[]>`
      update orders set supplier_order_no = ${supplierOrderNo}, supplier_sent_at = now(), supplier_claimed_at = null, supplier_error = null
       where id = ${orderId}
      returning status`;
    if (!row) return;
    await tx`insert into order_events (order_id, status, note)
             values (${orderId}, ${row.status}, ${`Skickad till Skylt & Gravyrteknik, deras order ${supplierOrderNo}`})`;
  });
}

/** Adressen kunden senast fick skyltar till, när de gick direkt till kunden. */
export async function latestCustomerDelivery(tenant: string, customerId: string): Promise<DeliveryAddress | null> {
  const sql = requireDb();
  const [row] = await sql<{ delivery: unknown }[]>`
    select delivery from orders
     where customer_id = ${customerId} and reseller_id = ${tenant} and delivery->>'to' = 'customer'
     order by placed_at desc limit 1`;
  return parseDelivery(row?.delivery)?.address ?? null;
}

const DELIVERY_ADDRESS_KEY = "delivery_address";

/** Återförsäljarens egen leveransadress, den som fylls i när skyltarna ska "till oss". */
export async function getResellerDeliveryAddress(tenant: string): Promise<DeliveryAddress | null> {
  const sql = requireDb();
  const [row] = await sql<{ value: unknown }[]>`select value from settings where key = ${settingsKey(tenant, DELIVERY_ADDRESS_KEY)}`;
  const parsed = deliveryAddressSchema.safeParse(row?.value);
  return parsed.success ? parsed.data : null;
}

export async function saveResellerDeliveryAddress(tenant: string, address: DeliveryAddress): Promise<void> {
  const sql = requireDb();
  await sql`
    insert into settings (key, value) values (${settingsKey(tenant, DELIVERY_ADDRESS_KEY)}, ${sql.json(address as unknown as Json)})
    on conflict (key) do update set value = excluded.value, updated_at = now()`;
}

export interface CustomerInput {
  name: string;
  email: string;
  company?: string | null;
  phone?: string | null;
  orgNumber?: string | null;
  address?: string | null;
}

/** Ny kund, eller samma kund om e-posten redan finns — ifyllda uppgifter skriver över, tomma behåller det gamla. */
export async function upsertCustomer(tenant: string, input: CustomerInput): Promise<Customer> {
  const sql = requireDb();
  const [row] = await sql<Customer[]>`
    insert into customers (reseller_id, email, name, company, phone, org_number, address)
    values (${tenant}, ${input.email.trim().toLowerCase()}, ${input.name}, ${input.company || null},
            ${input.phone || null}, ${input.orgNumber || null}, ${input.address || null})
    on conflict (reseller_id, email) do update
      set name = excluded.name,
          company = coalesce(excluded.company, customers.company),
          phone = coalesce(excluded.phone, customers.phone),
          org_number = coalesce(excluded.org_number, customers.org_number),
          address = coalesce(excluded.address, customers.address)
    returning ${sql.unsafe(CUSTOMER_COLUMNS)}`;
  if (!row) throw new Error("Kunden kunde inte sparas");
  return row;
}

/** Vad som hände när priserna skulle sparas. `locked`: priset går inte att ändra längre, `refused`: priset går inte att fakturera. */
export type PricingUpdate = "saved" | "missing" | "locked" | "refused";

/**
 * Nya priser på en order. Totalerna räknas om och ändringen syns i tidslinjen.
 *
 * På en direktorder fakturerar verkstaden kunden det pris ordern skickades med.
 * Priset ska därför gå att fakturera rad för rad (`isLineInvoiceable`), och det
 * ändras inte när ordern har gått till verkstaden eller är på väg dit. Kontrollen
 * görs med raden låst, så att ett utskick som pågår inte hinner emellan.
 */
export async function updateOrderPricing(tenant: string, orderNo: string, pricing: Pricing): Promise<PricingUpdate> {
  const sql = requireDb();
  const currentModel = await getPriceModel();
  return sql.begin(async (tx) => {
    const [row] = await tx<
      {
        id: string;
        badges: unknown;
        status: string;
        price_model: unknown;
        delivery: unknown;
        express_shipping_sek: number | null;
        payment: unknown;
        is_demo: boolean;
        sent: boolean;
        claimed: boolean;
      }[]
    >`
      select id, badges, status, price_model, delivery, express_shipping_sek, payment, is_demo,
             supplier_sent_at is not null as sent,
             coalesce(supplier_claimed_at > now() - interval '2 minutes', false) as claimed
        from orders
       where order_no = ${orderNo} and reseller_id = ${tenant} for update`;
    const badges = badgesSchema.safeParse(row?.badges);
    if (!row || !badges.success) return "missing";
    // En demoorder går aldrig till verkstaden, så där gäller ingen av spärrarna.
    if (!row.is_demo && isDirectOrder({ resellerId: tenant, payment: row.payment })) {
      if (row.sent || row.claimed) return "locked";
      if (!isLineInvoiceable(pricing)) return "refused";
    }
    const custom = isCustomPricing(pricing) ? pricing : null;
    const model = storedPriceModel(row.price_model, currentModel);
    const method = shippingMethodOf(parseDelivery(row.delivery));
    const price = priceWithPricing(badges.data, custom, endPriceTable(model), shippingFor(model, badges.data, method, row.express_shipping_sek));
    await tx`
      update orders set pricing = ${custom ? tx.json(custom as unknown as Json) : null},
             total_sek = ${price.totalSek}, total_incl_vat_sek = ${price.totalInclVatSek}
       where id = ${row.id}`;
    const note = custom
      ? `Pris justerat till ${price.totalSek} kr${price.savingsSek > 0 ? ` (${String(price.savingsPercent).replace(".", ",")} % rabatt)` : ""}${
          price.extrasSek > 0 ? `, varav extra ${price.extrasSek} kr` : ""
        }`
      : "Återställt till listpris";
    await tx`insert into order_events (order_id, status, note) values (${row.id}, ${row.status}, ${note})`;
    return "saved";
  });
}

/** Så många kunder får säljaren att välja bland i skyltmotorns varukorg. */
const CUSTOMER_CHOICES = 2000;

/** Säljarens kunder för kundvalet i skyltmotorns varukorg: bara det valet visar, i bokstavsordning. */
export async function listCustomerChoices(tenant: string): Promise<Pick<Customer, "id" | "name" | "company" | "email">[]> {
  return requireDb()<Pick<Customer, "id" | "name" | "company" | "email">[]>`
    select id, name, company, email from customers
     where reseller_id = ${tenant} and erased_at is null
     order by lower(coalesce(company, name)), id
     limit ${CUSTOMER_CHOICES}`;
}

export interface CustomerSummary extends Customer {
  orders: number;
  badges: number;
  revenueSek: number;
  lastOrderAt: string | null;
  designs: number;
}

export async function listCustomers(tenant: string): Promise<CustomerSummary[]> {
  const sql = requireDb();
  const rows = await sql<
    {
      id: string;
      name: string;
      company: string | null;
      email: string;
      phone: string | null;
      org_number: string | null;
      address: string | null;
      is_demo: boolean;
      orders: number;
      badges: number;
      revenue: number;
      last_order_at: Date | null;
      designs: number;
    }[]
  >`
    select c.id, c.name, c.company, c.email, c.phone, c.org_number, c.address, c.is_demo,
           count(o.id)::int as orders,
           coalesce(sum((select sum((b->>'quantity')::int) from jsonb_array_elements(o.badges) b)), 0)::int as badges,
           coalesce(sum(o.total_sek) filter (where o.status <> 'cancelled'), 0)::int as revenue,
           max(o.placed_at) as last_order_at,
           (select count(*)::int from designs d where d.customer_id = c.id) as designs
      from customers c
      left join orders o on o.customer_id = c.id
     where c.reseller_id = ${tenant}
     group by c.id
     order by max(o.placed_at) desc nulls last`;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    company: r.company,
    email: r.email,
    phone: r.phone,
    orgNumber: r.org_number,
    address: r.address,
    demo: r.is_demo,
    orders: r.orders,
    badges: r.badges,
    revenueSek: r.revenue,
    lastOrderAt: r.last_order_at ? r.last_order_at.toISOString() : null,
    designs: r.designs,
  }));
}

export async function getCustomer(tenant: string, id: string): Promise<Customer | null> {
  const sql = requireDb();
  if (!z.uuid().safeParse(id).success) return null;
  const [row] = await sql<Customer[]>`
    select ${sql.unsafe(CUSTOMER_COLUMNS)} from customers where id = ${id} and reseller_id = ${tenant}`;
  return row ?? null;
}

export interface Design {
  id: string;
  customerId: string;
  name: string;
  doc: BadgeDocument;
  createdAt: string;
}

export async function listDesigns(tenant: string, customerId: string): Promise<Design[]> {
  const sql = requireDb();
  const rows = await sql<{ id: string; customer_id: string; name: string; doc: unknown; created_at: Date }[]>`
    select d.id, d.customer_id, d.name, d.doc, d.created_at from designs d join customers c on c.id = d.customer_id
     where d.customer_id = ${customerId} and c.reseller_id = ${tenant} order by d.created_at desc`;
  return rows.flatMap((r) => {
    const doc = badgeDocumentSchema.safeParse(r.doc);
    return doc.success
      ? [{ id: r.id, customerId: r.customer_id, name: r.name, doc: doc.data, createdAt: r.created_at.toISOString() }]
      : [];
  });
}

export async function getDesign(tenant: string, id: string): Promise<Design | null> {
  const sql = requireDb();
  if (!z.uuid().safeParse(id).success) return null;
  const [r] = await sql<{ id: string; customer_id: string; name: string; doc: unknown; created_at: Date }[]>`
    select d.id, d.customer_id, d.name, d.doc, d.created_at from designs d join customers c on c.id = d.customer_id
     where d.id = ${id} and c.reseller_id = ${tenant}`;
  if (!r) return null;
  const doc = badgeDocumentSchema.safeParse(r.doc);
  return doc.success
    ? { id: r.id, customerId: r.customer_id, name: r.name, doc: doc.data, createdAt: r.created_at.toISOString() }
    : null;
}

export async function saveDesign(tenant: string, customerId: string, name: string, doc: BadgeDocument): Promise<string> {
  const sql = requireDb();
  const [stored = doc] = await withStoredLogoImages([doc]);
  const template = { ...stored, quantity: 1 };
  const [row] = await sql<{ id: string }[]>`
    insert into designs (customer_id, name, doc)
    select ${customerId}, ${name}, ${sql.json(template as unknown as Json)}
     where exists (select 1 from customers where id = ${customerId} and reseller_id = ${tenant})
    returning id`;
  if (!row) throw new Error("Mallen kunde inte sparas");
  return row.id;
}

export async function deleteDesign(tenant: string, id: string): Promise<void> {
  const sql = requireDb();
  if (!z.uuid().safeParse(id).success) return;
  await sql`delete from designs d using customers c where d.id = ${id} and c.id = d.customer_id and c.reseller_id = ${tenant}`;
}

export type ProofStatus = "pending" | "approved" | "changes";

export interface Proof {
  token: string;
  orderNo: string;
  status: ProofStatus;
  comment: string | null;
  createdAt: string;
  decidedAt: string | null;
}

function toProofStatus(value: string): ProofStatus {
  return value === "approved" || value === "changes" ? value : "pending";
}

/** En korrekturlänk per gång; token är slumpad och går inte att gissa. */
export async function createProof(tenant: string, orderNo: string): Promise<string | null> {
  const sql = requireDb();
  const token = randomBytes(18).toString("base64url");
  return sql.begin(async (tx) => {
    const [order] = await tx<{ id: string }[]>`select id from orders where order_no = ${orderNo} and reseller_id = ${tenant}`;
    if (!order) return null;
    await tx`insert into proofs (token, order_id) values (${token}, ${order.id})`;
    await tx`update orders set status = 'proof-sent' where id = ${order.id}`;
    await tx`insert into order_events (order_id, status, note) values (${order.id}, 'proof-sent', 'Korrekturlänk skapad')`;
    return token;
  });
}

export async function latestProof(tenant: string, orderNo: string): Promise<Proof | null> {
  const sql = requireDb();
  const [row] = await sql<
    { token: string; order_no: string; status: string; comment: string | null; created_at: Date; decided_at: Date | null }[]
  >`
    select p.token, o.order_no, p.status, p.comment, p.created_at, p.decided_at
      from proofs p join orders o on o.id = p.order_id
     where o.order_no = ${orderNo} and o.reseller_id = ${tenant}
     order by p.created_at desc limit 1`;
  return row
    ? {
        token: row.token,
        orderNo: row.order_no,
        status: toProofStatus(row.status),
        comment: row.comment,
        createdAt: row.created_at.toISOString(),
        decidedAt: row.decided_at ? row.decided_at.toISOString() : null,
      }
    : null;
}

export async function getProof(token: string): Promise<{ proof: Proof; order: StoredOrder } | null> {
  const sql = requireDb();
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const [row] = await sql<
    { token: string; order_no: string; status: string; comment: string | null; created_at: Date; decided_at: Date | null }[]
  >`
    select p.token, o.order_no, p.status, p.comment, p.created_at, p.decided_at
      from proofs p join orders o on o.id = p.order_id where p.token = ${token}`;
  if (!row) return null;
  const order = await getOrderAnyTenant(row.order_no);
  if (!order) return null;
  return {
    proof: {
      token: row.token,
      orderNo: row.order_no,
      status: toProofStatus(row.status),
      comment: row.comment,
      createdAt: row.created_at.toISOString(),
      decidedAt: row.decided_at ? row.decided_at.toISOString() : null,
    },
    order,
  };
}

/** Ordern ett korrektur gäller: vems den är och vilken kund som svarade. */
export interface ProofOrder {
  orderId: string;
  tenant: string;
  /** Kundens företag, eller namnet när företag saknas. */
  customerLabel: string;
}

/**
 * Kundens svar. Ett beslut är slutgiltigt — en ny ändring kräver en ny länk.
 * Svarar med ordern det gällde, eller `null` när korrekturet redan är besvarat.
 */
export async function decideProof(token: string, approved: boolean, comment: string | null): Promise<ProofOrder | null> {
  const sql = requireDb();
  return sql.begin(async (tx) => {
    const [proof] = await tx<{ order_id: string }[]>`
      update proofs set status = ${approved ? "approved" : "changes"}, comment = ${comment}, decided_at = now()
       where token = ${token} and status = 'pending'
      returning order_id`;
    if (!proof) return null;
    const status: OrderStatus = approved ? "approved" : "received";
    const note = approved ? "Kunden godkände korrekturen" : `Kunden vill ändra: ${comment ?? ""}`.trim();
    await tx`update orders set status = ${status} where id = ${proof.order_id}`;
    await tx`insert into order_events (order_id, status, note) values (${proof.order_id}, ${status}, ${note})`;
    const [order] = await tx<{ reseller_id: string; label: string }[]>`
      select o.reseller_id, coalesce(nullif(trim(c.company), ''), c.name) as label
        from orders o join customers c on c.id = o.customer_id
       where o.id = ${proof.order_id}`;
    return order ? { orderId: proof.order_id, tenant: order.reseller_id, customerLabel: order.label } : null;
  });
}
