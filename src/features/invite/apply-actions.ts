"use server";

import { headers } from "next/headers";
import { createRateLimiter } from "@/lib/ai/rate-limit";
import { databaseConfigured } from "@/lib/orders/repository";
import { resellerApplicationSchema } from "@/lib/reseller-auth/application-model";
import { saveApplication } from "@/lib/reseller-auth/applications";

const HOUR_MS = 60 * 60 * 1000;
const perClient = createRateLimiter({ limit: 5, windowMs: HOUR_MS });

export type ApplyResult = { ok: true } | { ok: false; error: string };

/**
 * Ett företag ansöker om att bli återförsäljare. Publik: ansökan ger inget
 * konto förrän namnskylt.com har godkänt den. Svaret är detsamma oavsett om
 * e-postadressen redan har ett konto, så att formuläret inte avslöjar vilka som är kunder.
 */
export async function applyAction(input: unknown): Promise<ApplyResult> {
  if (!databaseConfigured()) return { ok: false, error: "Ansökan går inte att ta emot just nu." };
  const forwarded = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "okänd";
  if (!perClient.take(`apply:${forwarded}`)) return { ok: false, error: "För många försök. Vänta en stund." };
  // Ett fält som bara en robot fyller i. Svaret ser ut som ett lyckat.
  if (typeof input === "object" && input !== null && "fax" in input && (input as { fax?: unknown }).fax) return { ok: true };
  const parsed = resellerApplicationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Kontrollera uppgifterna" };
  try {
    await saveApplication(parsed.data);
    return { ok: true };
  } catch (error) {
    console.error("Ansökan kunde inte sparas", error);
    return { ok: false, error: "Ansökan kunde inte sparas. Försök igen." };
  }
}
