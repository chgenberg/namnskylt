"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { createRateLimiter } from "@/lib/ai/rate-limit";
import { CUSTOMER_TOKEN_PATTERN, databaseConfigured } from "@/lib/orders/repository";
import { createReorderQuote } from "@/lib/quotes/reorder";

const HOUR_MS = 60 * 60 * 1000;
/** Varje försök sparar en offert, så både besökaren och länken har en gräns. */
const perClient = createRateLimiter({ limit: 10, windowMs: HOUR_MS });
const perOrder = createRateLimiter({ limit: 10, windowMs: HOUR_MS });

const reorderSchema = z.object({
  token: z.string().regex(CUSTOMER_TOKEN_PATTERN),
  names: z.string().trim().min(1, "Skriv minst ett namn.").max(20_000),
  quantity: z.number().int().min(1).max(1000),
});

/** Publik: koden i länken till ordersidan är behörigheten. Svaret är offerten kunden ska godkänna. */
export async function reorderAction(input: z.input<typeof reorderSchema>): Promise<{ ok: true; quotePath: string } | { ok: false; error: string }> {
  const parsed = reorderSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.path[0] === "names" ? "Skriv minst ett namn." : "Kontrollera uppgifterna." };
  if (!databaseConfigured()) return { ok: false, error: "Det går inte att beställa just nu." };
  const forwarded = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "okänd";
  if (!perClient.take(`reorder:${forwarded}`) || !perOrder.take(`reorder:${parsed.data.token}`)) {
    return { ok: false, error: "För många försök. Vänta en stund." };
  }
  try {
    return await createReorderQuote(parsed.data.token, parsed.data.names, parsed.data.quantity);
  } catch (error) {
    console.error("Beställningen av fler skyltar kunde inte sparas", error);
    return { ok: false, error: "Något gick fel. Försök igen." };
  }
}
