import "server-only";
import { randomBytes } from "node:crypto";
import type { Sql, TransactionSql } from "postgres";
import { z } from "zod";
import { badgeDocumentSchema, type BadgeDocument } from "@/engine";
import { requireDb } from "@/lib/db/client";
import { isCustomPricing, priceWithPricing, type Pricing } from "@/lib/orders/pricing";
import { parsePricing } from "@/lib/orders/repository";
import {
  addDays,
  isQuoteStatus,
  QUOTE_VALID_DAYS,
  swedishDay,
  type QuoteEvent,
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
}

function toQuote(row: QuoteRow): StoredQuote {
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
    status: isQuoteStatus(row.status) ? row.status : "draft",
    badges: badges.success ? badges.data : [],
    pricing: parsePricing(row.pricing),
    totalSek: row.total_sek,
    totalInclVatSek: row.total_incl_vat_sek,
    message: row.message,
    validUntil: row.valid_until,
    token: row.token,
    orderNo: row.order_no,
    declineReason: row.decline_reason,
    demo: row.is_demo,
    createdAt: row.created_at.toISOString(),
    sentAt: row.sent_at?.toISOString() ?? null,
    decidedAt: row.decided_at?.toISOString() ?? null,
    events,
  };
}

/** Stillbilden är den tunga kolumnen — listan klarar sig utan. */
function selectQuotes(sql: Sql, withShot = false) {
  return sql`
    select q.id, ${withShot ? sql`q.badge_shot` : sql`null::text`} as badge_shot, q.project, q.reseller_id, q.quote_no, q.status, q.badges, q.pricing, q.total_sek, q.total_incl_vat_sek, q.message,
           to_char(q.valid_until, 'YYYY-MM-DD') as valid_until, q.token, q.decline_reason, q.is_demo,
           q.created_at, q.sent_at, q.decided_at, o.order_no,
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
  return (await sql<QuoteRow[]>`${selectQuotes(sql)} where q.reseller_id = ${tenant} order by q.created_at desc`).map(toQuote);
}

export async function getQuote(tenant: string, quoteNo: string): Promise<StoredQuote | null> {
  const sql = requireDb();
  const [row] = await sql<QuoteRow[]>`${selectQuotes(sql, true)} where q.quote_no = ${quoteNo} and q.reseller_id = ${tenant}`;
  return row ? toQuote(row) : null;
}

export async function getQuoteByToken(token: string): Promise<StoredQuote | null> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const sql = requireDb();
  const [row] = await sql<QuoteRow[]>`${selectQuotes(sql, true)} where q.token = ${token}`;
  return row ? toQuote(row) : null;
}

export async function createQuote(input: {
  tenant: string;
  customerId: string;
  badges: BadgeDocument[];
  demo: boolean;
  badgeShot?: string | null;
  project?: string | null;
}): Promise<{ quoteNo: string }> {
  const sql = requireDb();
  const price = priceWithPricing(input.badges);
  const validUntil = addDays(swedishDay(new Date()), QUOTE_VALID_DAYS);
  const token = randomBytes(18).toString("base64url");
  return sql.begin(async (tx) => {
    // Kunden måste tillhöra samma återförsäljare — annars skapas ingen offert.
    const [row] = await tx<{ id: string; quote_no: string }[]>`
      insert into quotes (reseller_id, customer_id, badges, total_sek, total_incl_vat_sek, valid_until, token, is_demo, badge_shot, project)
      select ${input.tenant}, ${input.customerId}, ${tx.json(input.badges as unknown as Json)}, ${price.totalSek},
             ${price.totalInclVatSek}, ${validUntil}, ${token}, ${input.demo}, ${input.badgeShot ?? null}, ${input.project ?? null}
       where exists (select 1 from customers where id = ${input.customerId} and reseller_id = ${input.tenant})
      returning id, quote_no`;
    if (!row) throw new Error("Offerten kunde inte sparas");
    await tx`insert into quote_events (quote_id, status, note) values (${row.id}, 'draft', 'Offert skapad i skyltmotorn')`;
    return { quoteNo: row.quote_no };
  });
}

async function addEvent(tx: TransactionSql, quoteId: string, status: QuoteStatus, note: string | null) {
  await tx`insert into quote_events (quote_id, status, note) values (${quoteId}, ${status}, ${note})`;
}

/** Nya priser och villkor. En nekad offert som ändras blir ett utkast igen. */
export async function updateQuote(
  tenant: string,
  quoteNo: string,
  patch: { pricing?: Pricing; message?: string | null; validUntil?: string; project?: string | null },
): Promise<boolean> {
  const sql = requireDb();
  return sql.begin(async (tx) => {
    const [row] = await tx<{ id: string; badges: unknown; status: string; pricing: unknown }[]>`
      select id, badges, status, pricing from quotes where quote_no = ${quoteNo} and reseller_id = ${tenant} for update`;
    const badges = badgesSchema.safeParse(row?.badges);
    if (!row || !badges.success || !["draft", "sent", "declined"].includes(row.status)) return false;
    const pricing = patch.pricing !== undefined ? (isCustomPricing(patch.pricing) ? patch.pricing : null) : parsePricing(row.pricing);
    const price = priceWithPricing(badges.data, pricing);
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
