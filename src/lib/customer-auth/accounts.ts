import "server-only";
import type { Sql } from "postgres";
import { requireDb } from "@/lib/db/client";
import { hashPassword, verifyPassword } from "@/lib/reseller-auth/password";
import { isOwner } from "@/lib/tenants/model";
import { normalizeEmail, parseProfile, type AccountProfile, type CustomerAccountView } from "./model";

type Json = Parameters<Sql["json"]>[0];

export interface CustomerAccount {
  id: string;
  /** Butiken kontot hör till; `null` = namnskylt.com. */
  shop: string | null;
  email: string;
  profile: AccountProfile;
}

interface AccountRow {
  id: string;
  shop_slug: string | null;
  email: string;
  profile: unknown;
}

function toAccount(row: AccountRow): CustomerAccount {
  return { id: row.id, shop: row.shop_slug, email: row.email, profile: parseProfile(row.profile) };
}

/** Kontot som det får lämna servern. */
export function accountView(account: CustomerAccount): CustomerAccountView {
  return { email: account.email, profile: account.profile };
}

/** Villkoret för kontots plats: en butik eller namnskylt.com. */
function inScope(sql: Sql, shop: string | null) {
  return shop ? sql`shop_slug = ${shop}` : sql`shop_slug is null`;
}

export async function customerAccountExists(shop: string | null, email: string): Promise<boolean> {
  const sql = requireDb();
  const [row] = await sql`select 1 from customer_accounts where ${inScope(sql, shop)} and email = ${normalizeEmail(email)}`;
  return Boolean(row);
}

/** Kontots id för en e-postadress på ett ställe (namnskylt.com eller en butik), eller `null`. */
export async function customerAccountIdByEmail(shop: string | null, email: string): Promise<string | null> {
  const sql = requireDb();
  const [row] = await sql<{ id: string }[]>`select id from customer_accounts where ${inScope(sql, shop)} and email = ${normalizeEmail(email)}`;
  return row?.id ?? null;
}

/** Skapar kontot. `null` när e-postadressen redan har ett konto på samma ställe. */
export async function createCustomerAccount(input: {
  shop: string | null;
  email: string;
  password: string;
  profile: AccountProfile;
}): Promise<CustomerAccount | null> {
  const sql = requireDb();
  const [row] = await sql<AccountRow[]>`
    insert into customer_accounts (shop_slug, email, password_hash, profile, last_login_at)
    values (${input.shop}, ${normalizeEmail(input.email)}, ${await hashPassword(input.password)},
            ${sql.json(input.profile as unknown as Json)}, now())
    on conflict ((coalesce(shop_slug, '')), email) do nothing
    returning id, shop_slug, email, profile`;
  return row ? toAccount(row) : null;
}

/** Kontot för e-post och lösenord, eller `null`. Samma svar oavsett vilket som var fel. */
export async function authenticateCustomer(shop: string | null, email: string, password: string): Promise<CustomerAccount | null> {
  const sql = requireDb();
  const [row] = await sql<(AccountRow & { password_hash: string })[]>`
    select id, shop_slug, email, profile, password_hash from customer_accounts
     where ${inScope(sql, shop)} and email = ${normalizeEmail(email)}`;
  if (!row || !(await verifyPassword(password, row.password_hash))) return null;
  await sql`update customer_accounts set last_login_at = now() where id = ${row.id}`;
  return toAccount(row);
}

export async function getCustomerAccount(id: string): Promise<CustomerAccount | null> {
  const [row] = await requireDb()<AccountRow[]>`select id, shop_slug, email, profile from customer_accounts where id = ${id}`;
  return row ? toAccount(row) : null;
}

export async function saveAccountProfile(id: string, profile: AccountProfile): Promise<void> {
  const sql = requireDb();
  await sql`update customer_accounts set profile = ${sql.json(profile as unknown as Json)} where id = ${id}`;
}

export async function setCustomerPassword(id: string, password: string): Promise<void> {
  await requireDb()`update customer_accounts set password_hash = ${await hashPassword(password)} where id = ${id}`;
}

/** Sant när lösenordet är kontots nuvarande. */
export async function customerPasswordMatches(id: string, password: string): Promise<boolean> {
  const [row] = await requireDb()<{ password_hash: string }[]>`select password_hash from customer_accounts where id = ${id}`;
  return row ? verifyPassword(password, row.password_hash) : false;
}

/** Tar bort kontot med dess inloggningar och länkar. Ordrarna står kvar hos säljaren, utan koppling till kontot. */
export async function deleteCustomerAccount(id: string): Promise<boolean> {
  const rows = await requireDb()`delete from customer_accounts where id = ${id} returning id`;
  return rows.length > 0;
}

export interface CustomerAccountSummary {
  id: string;
  email: string;
  /** Butikens adress och namn; `null` = namnskylt.com. */
  shop: { slug: string; name: string } | null;
  name: string;
  company: string;
  createdAt: string;
  lastLoginAt: string | null;
  orders: number;
}

/**
 * Villkoret för kontona en återförsäljare sköter: de i butikerna den äger.
 * namnskylt.com sköter sina egna och dem i butiker som ingen har tagit över.
 */
function managedBy(sql: Sql, tenant: string) {
  return isOwner(tenant) ? sql`(a.shop_slug is null or s.owner_id is null)` : sql`s.owner_id = ${tenant}`;
}

/** Kundkontona som panelens ägare sköter, nyast först. */
export async function listCustomerAccounts(tenant: string): Promise<CustomerAccountSummary[]> {
  const sql = requireDb();
  const rows = await sql<(AccountRow & { shop_name: string | null; created_at: Date; last_login_at: Date | null; orders: number })[]>`
    select a.id, a.shop_slug, a.email, a.profile, a.created_at, a.last_login_at,
           s.data->'profile'->>'name' as shop_name,
           (select count(*)::int from orders o where o.account_id = a.id) as orders
      from customer_accounts a
      left join shops s on s.slug = a.shop_slug
     where ${managedBy(sql, tenant)}
     order by a.created_at desc
     limit 500`;
  return rows.map((row) => {
    const profile = parseProfile(row.profile);
    return {
      id: row.id,
      email: row.email,
      shop: row.shop_slug ? { slug: row.shop_slug, name: row.shop_name ?? row.shop_slug } : null,
      name: profile.name,
      company: profile.company,
      createdAt: row.created_at.toISOString(),
      lastLoginAt: row.last_login_at?.toISOString() ?? null,
      orders: row.orders,
    };
  });
}

/** Kontot, om panelens ägare sköter det. Annars `null`. */
export async function managedCustomerAccount(tenant: string, accountId: string): Promise<CustomerAccount | null> {
  const sql = requireDb();
  const [row] = await sql<AccountRow[]>`
    select a.id, a.shop_slug, a.email, a.profile
      from customer_accounts a
      left join shops s on s.slug = a.shop_slug
     where a.id = ${accountId} and ${managedBy(sql, tenant)}`;
  return row ? toAccount(row) : null;
}
