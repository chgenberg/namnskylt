import "server-only";
import { randomBytes } from "node:crypto";
import type { Sql } from "postgres";
import { z } from "zod";
import { badgeDocumentSchema, type BadgeDocument } from "@/engine";
import { db, requireDb } from "@/lib/db/client";
import { isCustomPricing, pricingSchema, priceWithPricing, type Pricing } from "./pricing";
import { purchaseTermsSchema, type PurchaseTerms } from "./purchase";
import { companyProfileSchema, DEFAULT_COMPANY, type CompanyProfile } from "@/lib/company/profile";
import { isOwner, settingsKey } from "@/lib/tenants/model";
import {
  isOrderSource,
  isOrderStatus,
  type Customer,
  type OrderEvent,
  type OrderSource,
  type OrderStatus,
  type StoredOrder,
} from "./model";

const badgesSchema = z.array(badgeDocumentSchema);

interface OrderRow {
  id: string;
  order_no: string;
  status: string;
  badges: unknown;
  pricing: unknown;
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
  events: { status: string; note: string | null; at: string }[] | null;
}

/** Databasen är inte klientdata, men validera ändå — ett trasigt dokument får inte nå produktionen. */
function toOrder(row: OrderRow): StoredOrder {
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
    resellerId: row.reseller_id,
    demo: row.is_demo,
  };
}

export function parsePricing(value: unknown): Pricing | null {
  const parsed = pricingSchema.safeParse(value);
  return parsed.success && isCustomPricing(parsed.data) ? parsed.data : null;
}

/** Kundens kolumner som ett `Customer` — samma urval överallt. */
const CUSTOMER_COLUMNS = "id, name, company, email, phone, org_number as \"orgNumber\", address, is_demo as demo";

type Json = Parameters<Sql["json"]>[0];

function selectOrders(sql: Sql) {
  return sql`
    select o.id, o.order_no, o.status, o.badges, o.pricing, o.total_sek, o.total_incl_vat_sek,
           o.supplier_order_no, o.partner_request_no, o.tracking_url, o.source, o.placed_at, o.is_demo, o.supplier_synced_at,
           o.badge_shot is not null as has_badge_shot, o.shop_slug, o.reseller_id,
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
  return rows.map(toOrder);
}

export async function getOrder(tenant: string, orderNo: string): Promise<StoredOrder | null> {
  const sql = requireDb();
  const [row] = await sql<OrderRow[]>`${selectOrders(sql)} where o.order_no = ${orderNo} and o.reseller_id = ${tenant}`;
  return row ? toOrder(row) : null;
}

/** Utan hyresgäst — bara för kundens egna länkar (korrektur), där token är behörigheten. */
async function getOrderAnyTenant(orderNo: string): Promise<StoredOrder | null> {
  const sql = requireDb();
  const [row] = await sql<OrderRow[]>`${selectOrders(sql)} where o.order_no = ${orderNo}`;
  return row ? toOrder(row) : null;
}

export async function listCustomerOrders(tenant: string, customerId: string): Promise<StoredOrder[]> {
  const sql = requireDb();
  const rows = await sql<OrderRow[]>`${selectOrders(sql)}
    where o.customer_id = ${customerId} and o.reseller_id = ${tenant} order by o.placed_at desc`;
  return rows.map(toOrder);
}

export interface NewOrder {
  customer: { name: string; email: string; company?: string | null };
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
  badgeShot?: string | null;
  shopSlug?: string | null;
  /** Återförsäljaren ordern tillhör; webbshoppen och butikerna är ägarens. */
  tenant: string;
}

/** Sparar ordern, kopplar den till kunden (samma e-post = samma kund) och loggar första steget. */
export async function createOrder(order: NewOrder): Promise<{ id: string; orderNo: string }> {
  const sql = requireDb();
  const pricing = isCustomPricing(order.pricing ?? null) ? (order.pricing ?? null) : null;
  const price = priceWithPricing(order.badges, pricing);
  const email = order.customer.email.trim().toLowerCase();
  const placedAt = order.placedAt ? new Date(order.placedAt) : new Date();
  const tenant = order.tenant;
  return sql.begin(async (tx) => {
    const [customer] = await tx<{ id: string }[]>`
      insert into customers (reseller_id, email, name, company, is_demo)
      values (${tenant}, ${email}, ${order.customer.name}, ${order.customer.company ?? null}, ${order.demo ?? false})
      on conflict (reseller_id, email) do update
        set name = excluded.name, company = coalesce(excluded.company, customers.company)
      returning id`;
    if (!customer) throw new Error("Kunden kunde inte sparas");
    const [saved] = await tx<{ id: string; order_no: string }[]>`
      insert into orders (customer_id, status, badges, pricing, total_sek, total_incl_vat_sek,
                          supplier_order_no, partner_request_no, source, repeat_of, placed_at, is_demo, badge_shot, shop_slug, reseller_id)
      values (${customer.id}, ${order.status}, ${tx.json(order.badges as unknown as Json)},
              ${pricing ? tx.json(pricing as unknown as Json) : null},
              ${price.totalSek}, ${price.totalInclVatSek}, ${order.supplierOrderNo ?? null},
              ${order.partnerRequestNo ?? null}, ${order.source}, ${order.repeatOf ?? null}, ${placedAt}, ${order.demo ?? false},
              ${order.badgeShot ?? null}, ${order.shopSlug ?? null}, ${tenant})
      returning id, order_no`;
    if (!saved) throw new Error("Ordern kunde inte sparas");
    await tx`insert into order_events (order_id, status, note, at) values (${saved.id}, ${order.status}, ${order.note ?? null}, ${placedAt})`;
    return { id: saved.id, orderNo: saved.order_no };
  });
}

export async function updateStatus(
  orderNo: string,
  status: OrderStatus,
  { note, trackingUrl }: { note?: string | null; trackingUrl?: string | null } = {},
): Promise<boolean> {
  const sql = requireDb();
  return sql.begin(async (tx) => {
    const [order] = await tx<{ id: string }[]>`
      update orders set status = ${status},
             tracking_url = coalesce(${trackingUrl ?? null}, tracking_url)
       where order_no = ${orderNo}
      returning id`;
    if (!order) return false;
    await tx`insert into order_events (order_id, status, note) values (${order.id}, ${status}, ${note ?? null})`;
    return true;
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
  const rows = await sql<{ kind: ShotKind; id: string; badge: unknown }[]>`
    (select 'order' as kind, order_no as id, badges->0 as badge, placed_at as at from orders
      where badge_shot is null and jsonb_array_length(badges) > 0 and reseller_id = ${tenant})
    union all
    (select 'quote', quote_no, badges->0, created_at from quotes
      where badge_shot is null and jsonb_array_length(badges) > 0 and reseller_id = ${tenant})
    order by at desc limit ${limit}`;
  return rows.flatMap((row) => {
    const badge = badgeDocumentSchema.safeParse(row.badge);
    return badge.success ? [{ kind: row.kind, id: row.id, badge: badge.data }] : [];
  });
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

const PURCHASE_TERMS_KEY = "purchase_terms";

/** `null` tills återförsäljaren ställt in sina villkor. */
export async function getPurchaseTerms(tenant: string): Promise<PurchaseTerms | null> {
  const sql = requireDb();
  const [row] = await sql<{ value: unknown }[]>`select value from settings where key = ${settingsKey(tenant, PURCHASE_TERMS_KEY)}`;
  const parsed = purchaseTermsSchema.safeParse(row?.value);
  return parsed.success ? parsed.data : null;
}

export async function savePurchaseTerms(tenant: string, terms: PurchaseTerms): Promise<void> {
  const sql = requireDb();
  await sql`
    insert into settings (key, value) values (${settingsKey(tenant, PURCHASE_TERMS_KEY)}, ${sql.json(terms as unknown as Json)})
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
  at: string;
}

/**
 * Leverantörens läge för en order. Statusen flyttas bara framåt (`canAdvance`
 * avgör), spårningslänken fylls på och avstämningstiden sparas oavsett.
 */
export async function applySupplierUpdate(
  supplierOrderNo: string,
  update: SupplierUpdate,
  canAdvance: (current: OrderStatus, next: OrderStatus) => boolean,
): Promise<{ found: boolean; changed: boolean }> {
  const sql = requireDb();
  return sql.begin(async (tx) => {
    const [order] = await tx<{ id: string; status: string }[]>`
      select id, status from orders
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
    return { found: true, changed: next !== null };
  });
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

/** Nya priser på en order. Totalerna räknas om och ändringen syns i tidslinjen. */
export async function updateOrderPricing(tenant: string, orderNo: string, pricing: Pricing): Promise<boolean> {
  const sql = requireDb();
  return sql.begin(async (tx) => {
    const [row] = await tx<{ id: string; badges: unknown; status: string }[]>`
      select id, badges, status from orders where order_no = ${orderNo} and reseller_id = ${tenant} for update`;
    const badges = badgesSchema.safeParse(row?.badges);
    if (!row || !badges.success) return false;
    const custom = isCustomPricing(pricing) ? pricing : null;
    const price = priceWithPricing(badges.data, custom);
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
    return true;
  });
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
  const template = { ...doc, quantity: 1 };
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

/** Kundens svar. Ett beslut är slutgiltigt — en ny ändring kräver en ny länk. */
export async function decideProof(token: string, approved: boolean, comment: string | null): Promise<boolean> {
  const sql = requireDb();
  return sql.begin(async (tx) => {
    const [proof] = await tx<{ order_id: string }[]>`
      update proofs set status = ${approved ? "approved" : "changes"}, comment = ${comment}, decided_at = now()
       where token = ${token} and status = 'pending'
      returning order_id`;
    if (!proof) return false;
    const status: OrderStatus = approved ? "approved" : "received";
    const note = approved ? "Kunden godkände korrekturen" : `Kunden vill ändra: ${comment ?? ""}`.trim();
    await tx`update orders set status = ${status} where id = ${proof.order_id}`;
    await tx`insert into order_events (order_id, status, note) values (${proof.order_id}, ${status}, ${note})`;
    return true;
  });
}
