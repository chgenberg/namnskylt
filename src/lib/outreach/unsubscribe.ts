import { verifyLinkToken } from "./link-token";
import type { SuppressionSource } from "./model";

/**
 * Avregistrering. GET visar bara en knapp — länkskannrar i mejlfilter hämtar
 * GET, så det är POST (formuläret eller List-Unsubscribe=One-Click) som spärrar.
 */

export interface UnsubscribeDeps {
  secrets: readonly (string | undefined)[];
  now: Date;
  emailForMessage: (messageId: string) => Promise<string | null>;
  suppress: (input: { email: string; source: SuppressionSource; messageId: string }) => Promise<boolean>;
}

export type UnsubscribeRequest = "one_click" | "form" | null;

/** Vilken sorts POST det är; `null` = kroppen är inte en avregistrering. */
export function unsubscribeRequestKind(body: string): UnsubscribeRequest {
  const params = new URLSearchParams(body);
  if (params.get("List-Unsubscribe") === "One-Click") return "one_click";
  if (params.get("confirm") === "ja") return "form";
  return null;
}

export type UnsubscribeOutcome = { ok: true; newlySuppressed: boolean } | { ok: false; reason: "invalid-link" };

export async function handleUnsubscribe(
  token: string,
  kind: Exclude<UnsubscribeRequest, null>,
  deps: UnsubscribeDeps,
): Promise<UnsubscribeOutcome> {
  const verified = verifyLinkToken(token, "unsubscribe", deps.secrets, deps.now);
  if (!verified.ok) return { ok: false, reason: "invalid-link" };
  const email = await deps.emailForMessage(verified.messageId);
  if (!email) return { ok: false, reason: "invalid-link" };
  const newlySuppressed = await deps.suppress({
    email,
    source: kind === "one_click" ? "one_click" : "link",
    messageId: verified.messageId,
  });
  return { ok: true, newlySuppressed };
}

/** Om en avregistreringslänk ser giltig ut — för att visa rätt sida vid GET. */
export function isUnsubscribeTokenValid(token: string, secrets: readonly (string | undefined)[], now: Date): boolean {
  return verifyLinkToken(token, "unsubscribe", secrets, now).ok;
}
