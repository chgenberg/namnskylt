import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { requireDb } from "@/lib/db/client";

/** `activate` = välj lösenord för en godkänd ansökan. `reset` = välj nytt lösenord för ett konto. */
export type AccessLinkKind = "activate" | "reset";

const DAY_MS = 24 * 60 * 60 * 1000;
/** En godkänd ansökan har två veckor på sig; en återställning är färskvara. */
const VALID_DAYS: Record<AccessLinkKind, number> = { activate: 14, reset: 3 };

export const ACCESS_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32}$/;

function hashOf(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface AccessLink {
  kind: AccessLinkKind;
  applicationId: string | null;
  accountId: string | null;
  expiresAt: string;
}

/**
 * Skapar en hemlig länk och gör äldre länkar för samma ansökan eller konto
 * ogiltiga. Länkens kod finns bara i svaret: i databasen ligger dess SHA-256.
 */
export async function createAccessLink(target: { applicationId: string } | { accountId: string }): Promise<{ token: string; expiresAt: string }> {
  const sql = requireDb();
  const kind: AccessLinkKind = "applicationId" in target ? "activate" : "reset";
  const token = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + VALID_DAYS[kind] * DAY_MS);
  await sql.begin(async (tx) => {
    if ("applicationId" in target) {
      await tx`update reseller_access_links set used_at = now() where application_id = ${target.applicationId} and used_at is null`;
      await tx`insert into reseller_access_links (token_hash, kind, application_id, expires_at)
               values (${hashOf(token)}, 'activate', ${target.applicationId}, ${expiresAt})`;
    } else {
      await tx`update reseller_access_links set used_at = now() where account_id = ${target.accountId} and used_at is null`;
      await tx`insert into reseller_access_links (token_hash, kind, account_id, expires_at)
               values (${hashOf(token)}, 'reset', ${target.accountId}, ${expiresAt})`;
    }
  });
  return { token, expiresAt: expiresAt.toISOString() };
}

/** Länken som koden gäller, eller `null` när den är använd, har gått ut eller aldrig funnits. */
export async function findAccessLink(token: string): Promise<AccessLink | null> {
  if (!ACCESS_TOKEN_PATTERN.test(token)) return null;
  const sql = requireDb();
  const [row] = await sql<{ kind: AccessLinkKind; application_id: string | null; account_id: string | null; expires_at: Date }[]>`
    select kind, application_id, account_id, expires_at from reseller_access_links
     where token_hash = ${hashOf(token)} and used_at is null and expires_at > now()`;
  return row ? { kind: row.kind, applicationId: row.application_id, accountId: row.account_id, expiresAt: row.expires_at.toISOString() } : null;
}

/** Förbrukar länken. `false` när någon annan redan hunnit före. */
export async function consumeAccessLink(token: string): Promise<boolean> {
  const sql = requireDb();
  const [row] = await sql<{ token_hash: string }[]>`
    update reseller_access_links set used_at = now()
     where token_hash = ${hashOf(token)} and used_at is null and expires_at > now()
    returning token_hash`;
  return Boolean(row);
}
