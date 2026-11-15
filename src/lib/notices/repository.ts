import "server-only";
import { requireDb } from "@/lib/db/client";
import { isNoticeKind, type NoticeKind, type NoticeTarget, type PanelNotice } from "./model";

export interface NewNotice {
  /** Den som äger panelen beskedet visas i. */
  tenant: string;
  kind: NoticeKind;
  who: string;
  detail?: string | null;
  quoteId?: string | null;
  orderId?: string | null;
  /** Ordern som nummer, när anroparen inte har dess id. */
  orderNo?: string | null;
  applicationId?: string | null;
}

interface NoticeRow {
  id: string;
  kind: string;
  who: string;
  detail: string | null;
  quote_no: string | null;
  order_no: string | null;
  created_at: Date;
}

function toNotice(row: NoticeRow): PanelNotice | null {
  if (!isNoticeKind(row.kind)) return null;
  return {
    id: row.id,
    kind: row.kind,
    who: row.who,
    detail: row.detail,
    quoteNo: row.quote_no,
    orderNo: row.order_no,
    createdAt: row.created_at.toISOString(),
  };
}

/** Sparar beskedet och svarar med det som det visas, med order- och offertnummer. */
export async function insertNotice(input: NewNotice): Promise<PanelNotice | null> {
  const sql = requireDb();
  const [row] = await sql<NoticeRow[]>`
    with added as (
      insert into notices (reseller_id, kind, who, detail, quote_id, order_id, application_id)
      values (
        ${input.tenant}, ${input.kind}, ${input.who}, ${input.detail?.trim() || null}, ${input.quoteId ?? null},
        coalesce(${input.orderId ?? null}::uuid, (select id from orders where order_no = ${input.orderNo ?? null})),
        ${input.applicationId ?? null}
      )
      returning *
    )
    select added.id, added.kind, added.who, added.detail, added.created_at, q.quote_no, o.order_no
      from added
      left join quotes q on q.id = added.quote_id
      left join orders o on o.id = added.order_id`;
  return row ? toNotice(row) : null;
}

/** Olästa besked, nyast först. */
export async function listUnreadNotices(tenant: string, limit = 20): Promise<PanelNotice[]> {
  const sql = requireDb();
  const rows = await sql<NoticeRow[]>`
    select n.id, n.kind, n.who, n.detail, n.created_at, q.quote_no, o.order_no
      from notices n
      left join quotes q on q.id = n.quote_id
      left join orders o on o.id = n.order_id
     where n.reseller_id = ${tenant} and n.read_at is null
     order by n.created_at desc
     limit ${limit}`;
  return rows.map(toNotice).filter((notice): notice is PanelNotice => notice !== null);
}

export async function countUnreadNotices(tenant: string, target: NoticeTarget = { all: true }): Promise<number> {
  const sql = requireDb();
  const [row] = await sql<{ count: number }[]>`
    select count(*)::int as count from notices n
     where n.reseller_id = ${tenant} and n.read_at is null and ${matches(target)}`;
  return row?.count ?? 0;
}

/** Märker beskeden som lästa. Svarar med antalet som ändrades. */
export async function markNoticesRead(tenant: string, target: NoticeTarget): Promise<number> {
  const sql = requireDb();
  const rows = await sql<{ id: string }[]>`
    update notices n set read_at = now()
     where n.reseller_id = ${tenant} and n.read_at is null and ${matches(target)}
    returning n.id`;
  return rows.length;
}

/** Ett äldre, oläst besked om samma ansökan tas bort när ansökan skickas in på nytt. */
export async function dropUnreadApplicationNotices(applicationId: string): Promise<void> {
  const sql = requireDb();
  await sql`delete from notices where application_id = ${applicationId} and read_at is null`;
}

export async function markNoticeEmailed(id: string): Promise<void> {
  const sql = requireDb();
  await sql`update notices set emailed_at = now() where id = ${id}`;
}

function matches(target: NoticeTarget) {
  const sql = requireDb();
  if ("orderNo" in target) return sql`n.order_id = (select id from orders where order_no = ${target.orderNo})`;
  if ("quoteNo" in target) return sql`n.quote_id = (select id from quotes where quote_no = ${target.quoteNo})`;
  if ("kind" in target) return sql`n.kind = ${target.kind}`;
  return sql`true`;
}
