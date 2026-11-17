import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { db, requireDb } from "@/lib/db/client";
import { parseProfile, CUSTOMER_SESSION_DAYS, customerCookieName, SESSION_TOKEN_PATTERN } from "./model";
import type { CustomerAccount } from "./accounts";

const SESSION_SECONDS = CUSTOMER_SESSION_DAYS * 24 * 60 * 60;

/** Bara kodens SHA-256 ligger i databasen, så att en läckt tabell inte ger några inloggningar. */
export function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** En slumpad kod för en kaka eller en länk: 32 byte i base64url. */
export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

export interface CustomerCookie {
  name: string;
  value: string;
  options: { httpOnly: true; sameSite: "lax"; secure: boolean; path: "/"; maxAge: number };
}

function cookie(shop: string | null, value: string, maxAge: number): CustomerCookie {
  return {
    name: customerCookieName(shop),
    value,
    options: { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge },
  };
}

/** Loggar in kontot: en ny inloggning sparas, och svaret är kakan som ska sättas. */
export async function signInCustomer(account: Pick<CustomerAccount, "id" | "shop">): Promise<CustomerCookie> {
  const sql = requireDb();
  const token = newToken();
  await sql`
    insert into customer_sessions (token_hash, account_id, expires_at)
    values (${tokenHash(token)}, ${account.id}, now() + make_interval(secs => ${SESSION_SECONDS}))`;
  return cookie(account.shop, token, SESSION_SECONDS);
}

/** Kakan som tar bort inloggningen i webbläsaren. */
export function signedOutCookie(shop: string | null): CustomerCookie {
  return cookie(shop, "", 0);
}

/** Kontot som koden gäller på den här platsen, eller `null`. Ett konto i en butik gäller aldrig i en annan. */
export async function customerFromToken(shop: string | null, token: string | undefined): Promise<CustomerAccount | null> {
  const sql = db();
  if (!sql || !token || !SESSION_TOKEN_PATTERN.test(token)) return null;
  const [row] = await sql<{ id: string; shop_slug: string | null; email: string; profile: unknown }[]>`
    select a.id, a.shop_slug, a.email, a.profile
      from customer_sessions s
      join customer_accounts a on a.id = s.account_id
     where s.token_hash = ${tokenHash(token)} and s.expires_at > now()`;
  if (!row || row.shop_slug !== shop) return null;
  return { id: row.id, shop: row.shop_slug, email: row.email, profile: parseProfile(row.profile) };
}

/** Kunden som är inloggad på namnskylt.com (`null`) eller i butiken. Läser kakan i förfrågan. */
export async function currentCustomer(shop: string | null): Promise<CustomerAccount | null> {
  return customerFromToken(shop, (await cookies()).get(customerCookieName(shop))?.value);
}

/** Loggar ut: inloggningen bakom förfrågans kaka tas bort. */
export async function signOutCustomer(shop: string | null): Promise<void> {
  const token = (await cookies()).get(customerCookieName(shop))?.value;
  const sql = db();
  if (sql && token && SESSION_TOKEN_PATTERN.test(token)) await sql`delete from customer_sessions where token_hash = ${tokenHash(token)}`;
}

/** Tar bort kontots alla inloggningar, till exempel när lösenordet byts. */
export async function endCustomerSessions(accountId: string): Promise<void> {
  await requireDb()`delete from customer_sessions where account_id = ${accountId}`;
}

/** Tar bort inloggningar och lösenordslänkar som har gått ut. Körs av bakgrundsjobbet. */
export async function pruneCustomerSessions(): Promise<number> {
  const sql = db();
  if (!sql) return 0;
  const sessions = await sql`delete from customer_sessions where expires_at < now() returning token_hash`;
  await sql`delete from customer_access_links where expires_at < now() - interval '30 days'`;
  return sessions.length;
}
