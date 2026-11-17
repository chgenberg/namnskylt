import "server-only";
import { requireDb } from "@/lib/db/client";
import { SESSION_TOKEN_PATTERN } from "./model";
import { newToken, tokenHash } from "./session";

/** Så länge gäller en länk för nytt lösenord. */
const VALID_DAYS = 3;

/**
 * En hemlig länk där kunden väljer nytt lösenord. Panelens ägare skapar den
 * och skickar den själv, eftersom sajten inte skickar mejl. Äldre länkar för
 * kontot slutar gälla. Koden finns bara i svaret: i databasen ligger dess SHA-256.
 */
export async function createCustomerAccessLink(accountId: string): Promise<{ token: string; expiresAt: string }> {
  const sql = requireDb();
  const token = newToken();
  const expiresAt = new Date(Date.now() + VALID_DAYS * 24 * 60 * 60 * 1000);
  await sql.begin(async (tx) => {
    await tx`update customer_access_links set used_at = now() where account_id = ${accountId} and used_at is null`;
    await tx`insert into customer_access_links (token_hash, account_id, expires_at) values (${tokenHash(token)}, ${accountId}, ${expiresAt})`;
  });
  return { token, expiresAt: expiresAt.toISOString() };
}

/** Gör kontots väntande länkar ogiltiga, till exempel när kunden själv har bytt lösenord. */
export async function voidCustomerAccessLinks(accountId: string): Promise<void> {
  await requireDb()`update customer_access_links set used_at = now() where account_id = ${accountId} and used_at is null`;
}

/** Kontot som länken gäller, eller `null` när den är använd, har gått ut eller aldrig funnits. */
export async function customerAccessLinkAccount(token: string): Promise<string | null> {
  if (!SESSION_TOKEN_PATTERN.test(token)) return null;
  const [row] = await requireDb()<{ account_id: string }[]>`
    select account_id from customer_access_links
     where token_hash = ${tokenHash(token)} and used_at is null and expires_at > now()`;
  return row?.account_id ?? null;
}

/** Förbrukar länken. Svarar med kontot, eller `null` när någon annan redan hunnit före. */
export async function consumeCustomerAccessLink(token: string): Promise<string | null> {
  if (!SESSION_TOKEN_PATTERN.test(token)) return null;
  const [row] = await requireDb()<{ account_id: string }[]>`
    update customer_access_links set used_at = now()
     where token_hash = ${tokenHash(token)} and used_at is null and expires_at > now()
    returning account_id`;
  return row?.account_id ?? null;
}
