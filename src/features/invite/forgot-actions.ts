"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { createRateLimiter } from "@/lib/ai/rate-limit";
import { passwordResetAvailable, requestPasswordReset } from "@/lib/reseller-auth/forgot";

const HOUR_MS = 60 * 60 * 1000;
const perClient = createRateLimiter({ limit: 5, windowMs: HOUR_MS });
/** Ingen brevlåda ska kunna fyllas med länkar av någon annan. */
const perAddress = createRateLimiter({ limit: 3, windowMs: HOUR_MS });

export type ForgotResult = { ok: true } | { ok: false; error: string };

/**
 * Någon har glömt sitt lösenord. Svaret är detsamma oavsett om adressen har
 * ett konto, så att formuläret inte avslöjar vilka som är kunder.
 */
export async function forgotPasswordAction(input: unknown): Promise<ForgotResult> {
  if (!passwordResetAvailable()) return { ok: false, error: "Det går inte att mejla en länk just nu. Hör av dig till namnskylt.com." };
  const email = z.email().max(200).safeParse(typeof input === "string" ? input.trim().toLowerCase() : input);
  if (!email.success) return { ok: false, error: "Ange en giltig e-postadress." };
  const forwarded = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "okänd";
  if (!perClient.take(`forgot:${forwarded}`)) return { ok: false, error: "För många försök. Vänta en stund." };
  // Över gränsen per adress svarar vi som vanligt men skickar inget.
  if (perAddress.take(`forgot:${email.data}`)) await requestPasswordReset(email.data);
  return { ok: true };
}
