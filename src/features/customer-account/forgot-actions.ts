"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { createRateLimiter } from "@/lib/ai/rate-limit";
import { customerPasswordResetAvailable, requestCustomerPasswordReset } from "@/lib/customer-auth/forgot";
import { SHOP_SLUG } from "@/lib/shops/model-slug";

const HOUR_MS = 60 * 60 * 1000;
const perClient = createRateLimiter({ limit: 5, windowMs: HOUR_MS });
/** Ingen brevlåda ska kunna fyllas med länkar av någon annan. */
const perAddress = createRateLimiter({ limit: 3, windowMs: HOUR_MS });

export type CustomerForgotResult = { ok: true } | { ok: false; error: string };

/**
 * En kund har glömt sitt lösenord (namnskylt.com eller en butik). Svaret är detsamma oavsett om
 * adressen har ett konto, så att formuläret inte avslöjar vilka som är kunder.
 */
export async function customerForgotPasswordAction(shop: unknown, input: unknown): Promise<CustomerForgotResult> {
  const slug = shop === null ? null : typeof shop === "string" && SHOP_SLUG.test(shop) ? shop : undefined;
  if (slug === undefined) return { ok: false, error: "Butiken finns inte." };
  if (!customerPasswordResetAvailable()) return { ok: false, error: "Det går inte att mejla en länk just nu. Hör av dig till oss." };
  const email = z.email().max(200).safeParse(typeof input === "string" ? input.trim().toLowerCase() : input);
  if (!email.success) return { ok: false, error: "Ange en giltig e-postadress." };
  const forwarded = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "okänd";
  if (!perClient.take(`kund-glomt:${forwarded}`)) return { ok: false, error: "För många försök. Vänta en stund." };
  // Över gränsen per adress svarar vi som vanligt men skickar inget.
  if (perAddress.take(`kund-glomt:${slug ?? ""}:${email.data}`)) await requestCustomerPasswordReset(slug, email.data);
  return { ok: true };
}
