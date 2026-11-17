import type { CustomerAccountView, ProfileDraft } from "./model";

/**
 * Webbläsarens anrop till kundkontots API: logga in, skapa konto och logga ut.
 * `shop` är butikens adress, och `null` är namnskylt.com.
 */

export type AccountResult = { ok: true; account: CustomerAccountView } | { ok: false; error: string };

async function accountRequest(path: string, body: Record<string, unknown>): Promise<AccountResult> {
  try {
    const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = (await response.json().catch(() => null)) as { account?: CustomerAccountView; error?: string } | null;
    if (response.ok && data?.account) return { ok: true, account: data.account };
    return { ok: false, error: data?.error ?? "Något gick fel. Försök igen." };
  } catch {
    return { ok: false, error: "Kunde inte nå servern." };
  }
}

export function signInRequest(shop: string | null, email: string, password: string): Promise<AccountResult> {
  return accountRequest("/api/customer/session", { ...(shop && { shop }), email: email.trim(), password });
}

export function registerRequest(shop: string | null, input: { email: string; password: string; profile?: ProfileDraft }): Promise<AccountResult> {
  return accountRequest("/api/customer/account", { ...(shop && { shop }), ...input, email: input.email.trim() });
}

/** Loggar ut. Går anropet inte fram ligger kakan kvar, och kunden är fortfarande inloggad. */
export async function signOutRequest(shop: string | null): Promise<boolean> {
  try {
    const response = await fetch("/api/customer/session", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(shop ? { shop } : {}),
    });
    return response.ok;
  } catch {
    return false;
  }
}
