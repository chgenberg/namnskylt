import "server-only";
import { requireDb } from "@/lib/db/client";
import { isOwner, TENANT_ID } from "@/lib/tenants/model";
import { hashPassword, verifyPassword } from "./password";

export interface ResellerAccount {
  id: string;
  name: string;
  email: string;
}

/** Kontot för e-post och lösenord, eller `null` — samma svar oavsett vilket som var fel. */
export async function authenticate(email: string, password: string): Promise<ResellerAccount | null> {
  const sql = requireDb();
  const [row] = await sql<(ResellerAccount & { password_hash: string })[]>`
    select id, name, email, password_hash from reseller_accounts where email = ${email.trim().toLowerCase()}`;
  if (!row || isOwner(row.id) || !(await verifyPassword(password, row.password_hash))) return null;
  return { id: row.id, name: row.name, email: row.email };
}

export async function createAccount(input: { id: string; name: string; email: string; password: string }): Promise<void> {
  if (!TENANT_ID.test(input.id)) throw new Error("Ogiltigt id");
  // Ägarens id är admin-inlogget. Ett konto med det id:t skulle ge en återförsäljare hela panelen.
  if (isOwner(input.id)) throw new Error("Id:t är upptaget av namnskylt.com");
  const sql = requireDb();
  await sql`
    insert into reseller_accounts (id, name, email, password_hash)
    values (${input.id}, ${input.name}, ${input.email.trim().toLowerCase()}, ${await hashPassword(input.password)})`;
}

/** Ett ledigt konto-id med `base` som grund: exempelprofil, exempelprofil-2 … */
export async function freeTenantId(base: string): Promise<string> {
  const root = TENANT_ID.test(base) && !isOwner(base) ? base : "aterforsaljare";
  for (let n = 1; n < 100; n++) {
    const id = n === 1 ? root : `${root.slice(0, 36)}-${n}`;
    if (!(await accountExists(id))) return id;
  }
  throw new Error("Inget ledigt konto-id");
}

/** Nytt lösenord för ett konto. */
export async function setPassword(id: string, password: string): Promise<void> {
  const sql = requireDb();
  await sql`update reseller_accounts set password_hash = ${await hashPassword(password)} where id = ${id}`;
}

/** Sant när lösenordet är kontots nuvarande. */
export async function passwordMatches(id: string, password: string): Promise<boolean> {
  const sql = requireDb();
  const [row] = await sql<{ password_hash: string }[]>`select password_hash from reseller_accounts where id = ${id}`;
  return row ? verifyPassword(password, row.password_hash) : false;
}

export interface AccountSummary extends ResellerAccount {
  createdAt: string;
  orders: number;
  /** Butiken kontot har tagit över, om någon. */
  shopSlug: string | null;
}

/** Alla återförsäljarkonton, nyast först. Bara för admin. */
export async function listAccounts(): Promise<AccountSummary[]> {
  const sql = requireDb();
  const rows = await sql<{ id: string; name: string; email: string; created_at: Date; orders: number; shop_slug: string | null }[]>`
    select a.id, a.name, a.email, a.created_at,
           (select count(*)::int from orders o where o.reseller_id = a.id and not o.is_demo) as orders,
           (select s.slug from shops s where s.owner_id = a.id order by s.slug limit 1) as shop_slug
      from reseller_accounts a
     order by a.created_at desc`;
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    createdAt: row.created_at.toISOString(),
    orders: row.orders,
    shopSlug: row.shop_slug,
  }));
}

export async function accountExists(id: string): Promise<boolean> {
  const sql = requireDb();
  const [row] = await sql`select 1 from reseller_accounts where id = ${id}`;
  return Boolean(row);
}

export async function accountIdByEmail(email: string): Promise<string | null> {
  const sql = requireDb();
  const [row] = await sql<{ id: string }[]>`select id from reseller_accounts where email = ${email.trim().toLowerCase()}`;
  return row?.id ?? null;
}

/** Kontots e-postadress, eller `null` för ägaren och för ett id utan konto. */
export async function accountEmail(id: string): Promise<string | null> {
  const sql = requireDb();
  const [row] = await sql<{ email: string }[]>`select email from reseller_accounts where id = ${id}`;
  return row?.email ?? null;
}
