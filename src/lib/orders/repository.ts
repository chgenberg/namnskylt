import "server-only";
import { randomBytes } from "node:crypto";
import type { Sql } from "postgres";
import { z } from "zod";
import { badgeDocumentSchema, priceOrder, type BadgeDocument } from "@/engine";
import { db, requireDb } from "@/lib/db/client";
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
  total_sek: number;
  total_incl_vat_sek: number;
  supplier_order_no: string | null;
  partner_request_no: string | null;
  tracking_url: string | null;
  source: string;
  repeat_of_order_no: string | null;
  placed_at: Date;
  customer_id: string;
  customer_name: string;
  customer_company: string | null;
  customer_email: string;
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
    customer: { id: row.customer_id, name: row.customer_name, company: row.customer_company, email: row.customer_email },
    status: isOrderStatus(row.status) ? row.status : "received",
    badges: badges.success ? badges.data : [],
    totalSek: row.total_sek,
    totalInclVatSek: row.total_incl_vat_sek,
    supplierOrderNo: row.supplier_order_no,
    partnerRequestNo: row.partner_request_no,
    trackingUrl: row.tracking_url,
    source: isOrderSource(row.source) ? row.source : "web",
    repeatOfOrderNo: row.repeat_of_order_no,
    placedAt: row.placed_at.toISOString(),
    events,
  };
}

function selectOrders(sql: Sql) {
  return sql`
    select o.id, o.order_no, o.status, o.badges, o.total_sek, o.total_incl_vat_sek,
           o.supplier_order_no, o.partner_request_no, o.tracking_url, o.source, o.placed_at,
           r.order_no as repeat_of_order_no,
           c.id as customer_id, c.name as customer_name, c.company as customer_company, c.email as customer_email,
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

export async function listOrders(): Promise<StoredOrder[]> {
  const sql = requireDb();
  const rows = await sql<OrderRow[]>`${selectOrders(sql)} order by o.placed_at desc`;
  return rows.map(toOrder);
}

export async function getOrder(orderNo: string): Promise<StoredOrder | null> {
  const sql = requireDb();
  const [row] = await sql<OrderRow[]>`${selectOrders(sql)} where o.order_no = ${orderNo}`;
  return row ? toOrder(row) : null;
}

export async function listCustomerOrders(customerId: string): Promise<StoredOrder[]> {
  const sql = requireDb();
  const rows = await sql<OrderRow[]>`${selectOrders(sql)} where o.customer_id = ${customerId} order by o.placed_at desc`;
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
}

/** Sparar ordern, kopplar den till kunden (samma e-post = samma kund) och loggar första steget. */
export async function createOrder(order: NewOrder): Promise<{ id: string; orderNo: string }> {
  const sql = requireDb();
  const price = priceOrder(order.badges);
  const email = order.customer.email.trim().toLowerCase();
  const placedAt = order.placedAt ? new Date(order.placedAt) : new Date();
  return sql.begin(async (tx) => {
    const [customer] = await tx<{ id: string }[]>`
      insert into customers (email, name, company)
      values (${email}, ${order.customer.name}, ${order.customer.company ?? null})
      on conflict (email) do update
        set name = excluded.name, company = coalesce(excluded.company, customers.company)
      returning id`;
    if (!customer) throw new Error("Kunden kunde inte sparas");
    const [saved] = await tx<{ id: string; order_no: string }[]>`
      insert into orders (customer_id, status, badges, total_sek, total_incl_vat_sek,
                          supplier_order_no, partner_request_no, source, repeat_of, placed_at)
      values (${customer.id}, ${order.status}, ${tx.json(order.badges as unknown as Parameters<typeof tx.json>[0])},
              ${price.totalSek}, ${price.totalInclVatSek}, ${order.supplierOrderNo ?? null},
              ${order.partnerRequestNo ?? null}, ${order.source}, ${order.repeatOf ?? null}, ${placedAt})
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

export interface CustomerSummary extends Customer {
  orders: number;
  badges: number;
  revenueSek: number;
  lastOrderAt: string | null;
  designs: number;
}

export async function listCustomers(): Promise<CustomerSummary[]> {
  const sql = requireDb();
  const rows = await sql<
    {
      id: string;
      name: string;
      company: string | null;
      email: string;
      orders: number;
      badges: number;
      revenue: number;
      last_order_at: Date | null;
      designs: number;
    }[]
  >`
    select c.id, c.name, c.company, c.email,
           count(o.id)::int as orders,
           coalesce(sum((select sum((b->>'quantity')::int) from jsonb_array_elements(o.badges) b)), 0)::int as badges,
           coalesce(sum(o.total_sek) filter (where o.status <> 'cancelled'), 0)::int as revenue,
           max(o.placed_at) as last_order_at,
           (select count(*)::int from designs d where d.customer_id = c.id) as designs
      from customers c
      left join orders o on o.customer_id = c.id
     group by c.id
     order by max(o.placed_at) desc nulls last`;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    company: r.company,
    email: r.email,
    orders: r.orders,
    badges: r.badges,
    revenueSek: r.revenue,
    lastOrderAt: r.last_order_at ? r.last_order_at.toISOString() : null,
    designs: r.designs,
  }));
}

export async function getCustomer(id: string): Promise<Customer | null> {
  const sql = requireDb();
  if (!z.uuid().safeParse(id).success) return null;
  const [row] = await sql<Customer[]>`select id, name, company, email from customers where id = ${id}`;
  return row ?? null;
}

export interface Design {
  id: string;
  customerId: string;
  name: string;
  doc: BadgeDocument;
  createdAt: string;
}

export async function listDesigns(customerId: string): Promise<Design[]> {
  const sql = requireDb();
  const rows = await sql<{ id: string; customer_id: string; name: string; doc: unknown; created_at: Date }[]>`
    select id, customer_id, name, doc, created_at from designs where customer_id = ${customerId} order by created_at desc`;
  return rows.flatMap((r) => {
    const doc = badgeDocumentSchema.safeParse(r.doc);
    return doc.success
      ? [{ id: r.id, customerId: r.customer_id, name: r.name, doc: doc.data, createdAt: r.created_at.toISOString() }]
      : [];
  });
}

export async function getDesign(id: string): Promise<Design | null> {
  const sql = requireDb();
  if (!z.uuid().safeParse(id).success) return null;
  const [r] = await sql<{ id: string; customer_id: string; name: string; doc: unknown; created_at: Date }[]>`
    select id, customer_id, name, doc, created_at from designs where id = ${id}`;
  if (!r) return null;
  const doc = badgeDocumentSchema.safeParse(r.doc);
  return doc.success
    ? { id: r.id, customerId: r.customer_id, name: r.name, doc: doc.data, createdAt: r.created_at.toISOString() }
    : null;
}

export async function saveDesign(customerId: string, name: string, doc: BadgeDocument): Promise<string> {
  const sql = requireDb();
  const template = { ...doc, quantity: 1 };
  const [row] = await sql<{ id: string }[]>`
    insert into designs (customer_id, name, doc)
    values (${customerId}, ${name}, ${sql.json(template as unknown as Parameters<typeof sql.json>[0])})
    returning id`;
  if (!row) throw new Error("Mallen kunde inte sparas");
  return row.id;
}

export async function deleteDesign(id: string): Promise<void> {
  const sql = requireDb();
  if (!z.uuid().safeParse(id).success) return;
  await sql`delete from designs where id = ${id}`;
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
export async function createProof(orderNo: string): Promise<string | null> {
  const sql = requireDb();
  const token = randomBytes(18).toString("base64url");
  return sql.begin(async (tx) => {
    const [order] = await tx<{ id: string }[]>`select id from orders where order_no = ${orderNo}`;
    if (!order) return null;
    await tx`insert into proofs (token, order_id) values (${token}, ${order.id})`;
    await tx`update orders set status = 'proof-sent' where id = ${order.id}`;
    await tx`insert into order_events (order_id, status, note) values (${order.id}, 'proof-sent', 'Korrekturlänk skapad')`;
    return token;
  });
}

export async function latestProof(orderNo: string): Promise<Proof | null> {
  const sql = requireDb();
  const [row] = await sql<
    { token: string; order_no: string; status: string; comment: string | null; created_at: Date; decided_at: Date | null }[]
  >`
    select p.token, o.order_no, p.status, p.comment, p.created_at, p.decided_at
      from proofs p join orders o on o.id = p.order_id
     where o.order_no = ${orderNo}
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
  const order = await getOrder(row.order_no);
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
