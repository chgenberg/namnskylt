"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import { createRateLimiter } from "@/lib/ai/rate-limit";
import { consumeCustomerAccessLink, customerAccessLinkAccount, voidCustomerAccessLinks } from "@/lib/customer-auth/access-links";
import {
  customerPasswordMatches,
  deleteCustomerAccount,
  getCustomerAccount,
  saveAccountProfile,
  setCustomerPassword,
} from "@/lib/customer-auth/accounts";
import {
  accountPaths,
  customerPasswordSchema,
  MAX_PASSWORD_CHARS,
  MIN_CUSTOMER_PASSWORD_CHARS,
  profileInputSchema,
  type AccountProfile,
} from "@/lib/customer-auth/model";
import { currentCustomer, endCustomerSessions, signInCustomer, signedOutCookie, type CustomerCookie } from "@/lib/customer-auth/session";
import { addressFromDraft, type DeliveryDraft } from "@/lib/orders/delivery";
import { databaseConfigured } from "@/lib/orders/repository";
import { SHOP_SLUG } from "@/lib/shops/model";

export type AccountActionResult = { ok: true } | { ok: false; error: string };

const HOUR_MS = 60 * 60 * 1000;
const passwordAttempts = createRateLimiter({ limit: 10, windowMs: HOUR_MS });
const linkAttempts = createRateLimiter({ limit: 20, windowMs: HOUR_MS });

const NOT_SIGNED_IN = "Du är inte inloggad längre. Logga in igen.";
const scopeSchema = z.string().regex(SHOP_SLUG).nullable();

/** Kontot som är inloggat på platsen. Varje action kontrollerar själv: en action är en öppen POST. */
async function signedIn(shop: unknown) {
  const scope = scopeSchema.safeParse(shop);
  return scope.success && databaseConfigured() ? currentCustomer(scope.data) : null;
}

async function setCookie(cookie: CustomerCookie): Promise<void> {
  (await cookies()).set(cookie.name, cookie.value, cookie.options);
}

export interface ProfileInput {
  name: string;
  company: string;
  orgNumber: string;
  delivery: DeliveryDraft;
}

/** Sparar kundens uppgifter. En helt tom leveransadress betyder att ingen adress sparas. */
export async function saveProfileAction(shop: string | null, input: ProfileInput): Promise<AccountActionResult> {
  const account = await signedIn(shop);
  if (!account) return { ok: false, error: NOT_SIGNED_IN };
  const draft = input?.delivery;
  const empty = !draft || Object.values(draft).every((value) => typeof value !== "string" || value.trim() === "");
  const address = empty ? null : addressFromDraft(draft);
  if (address && !address.ok) return { ok: false, error: address.error };
  const parsed = profileInputSchema.safeParse({
    name: input?.name,
    company: input?.company,
    orgNumber: typeof input?.orgNumber === "string" ? input.orgNumber.trim() : input?.orgNumber,
    delivery: address ? address.address : null,
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Uppgifterna går inte att spara" };
  await saveAccountProfile(account.id, parsed.data satisfies AccountProfile);
  return { ok: true };
}

const changeSchema = z.object({ current: z.string().min(1).max(MAX_PASSWORD_CHARS), next: customerPasswordSchema });

/** Kunden byter sitt lösenord. Övriga inloggningar och väntande lösenordslänkar slutar gälla, och den här får en ny kaka. */
export async function changePasswordAction(shop: string | null, input: { current: string; next: string }): Promise<AccountActionResult> {
  const account = await signedIn(shop);
  if (!account) return { ok: false, error: NOT_SIGNED_IN };
  if (!passwordAttempts.take(account.id)) return { ok: false, error: "För många försök. Vänta en stund." };
  const parsed = changeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: `Det nya lösenordet ska ha minst ${MIN_CUSTOMER_PASSWORD_CHARS} tecken` };
  if (!(await customerPasswordMatches(account.id, parsed.data.current))) return { ok: false, error: "Det nuvarande lösenordet stämmer inte" };
  await setCustomerPassword(account.id, parsed.data.next);
  await endCustomerSessions(account.id);
  await voidCustomerAccessLinks(account.id);
  await setCookie(await signInCustomer(account));
  return { ok: true };
}

/** Kunden tar bort sitt konto. Ordrarna står kvar hos säljaren, men kontot och dess uppgifter försvinner. */
export async function deleteAccountAction(shop: string | null): Promise<AccountActionResult> {
  const account = await signedIn(shop);
  if (!account) return { ok: false, error: NOT_SIGNED_IN };
  await deleteCustomerAccount(account.id);
  await setCookie(signedOutCookie(account.shop));
  return { ok: true };
}

export type ChoosePasswordResult = { ok: true; home: string } | { ok: false; error: string };

const GONE = "Länken är använd eller har gått ut. Be om en ny.";

/**
 * Väljer nytt lösenord via länken som säljaren har skickat. Länken gäller en
 * gång. Äldre inloggningar slutar gälla, och den som lyckas är inloggad.
 */
export async function choosePasswordAction(token: string, password: string): Promise<ChoosePasswordResult> {
  if (typeof token !== "string" || !databaseConfigured()) return { ok: false, error: GONE };
  if (!linkAttempts.take(`kundlank:${token}`)) return { ok: false, error: "För många försök. Vänta en stund." };
  const parsed = customerPasswordSchema.safeParse(password);
  if (!parsed.success) return { ok: false, error: `Lösenordet ska ha minst ${MIN_CUSTOMER_PASSWORD_CHARS} tecken` };
  // Länken prövas först utan att förbrukas, så att ett för kort lösenord inte kostar kunden länken.
  if (!(await customerAccessLinkAccount(token))) return { ok: false, error: GONE };
  const accountId = await consumeCustomerAccessLink(token);
  const account = accountId ? await getCustomerAccount(accountId) : null;
  if (!account) return { ok: false, error: GONE };
  await setCustomerPassword(account.id, parsed.data);
  await endCustomerSessions(account.id);
  await setCookie(await signInCustomer(account));
  return { ok: true, home: accountPaths(account.shop).home };
}
