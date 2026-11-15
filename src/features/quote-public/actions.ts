"use server";

import { z } from "zod";
import { deliveryAddressSchema } from "@/lib/orders/delivery";
import { acceptQuote, declineByCustomer } from "@/lib/quotes/accept";
import { canCustomerAnswer } from "@/lib/quotes/model";
import { getQuoteByToken } from "@/lib/quotes/repository";

const decisionSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/),
  accept: z.boolean(),
  reason: z.string().trim().max(1000).optional(),
  /** Leveransadressen, när skyltarna ska till kunden. */
  delivery: deliveryAddressSchema.optional(),
});

/** Publik — länkens token är behörigheten. Godkänd offert blir en order direkt. */
export async function decideQuoteAction(input: z.input<typeof decisionSchema>): Promise<{ ok: boolean; error?: string; orderNo?: string }> {
  const parsed = decisionSchema.safeParse(input);
  if (!parsed.success) {
    const field = parsed.error.issues[0];
    // Adressens fel är skrivna för kunden; övriga fel beror på en trasig sida.
    return { ok: false, error: field?.path[0] === "delivery" ? field.message : "Ogiltigt svar" };
  }
  const { token, accept, reason, delivery } = parsed.data;
  try {
    const quote = await getQuoteByToken(token);
    if (!quote || !canCustomerAnswer(quote)) return { ok: false, error: "Offerten går inte att besvara längre" };
    if (!accept) {
      const ok = await declineByCustomer(quote, reason || null);
      return ok ? { ok: true } : { ok: false, error: "Offerten är redan besvarad" };
    }
    const result = await acceptQuote(quote.resellerId, quote.quoteNo, false, delivery ?? null);
    return result.ok ? { ok: true, orderNo: result.orderNo } : { ok: false, error: result.error };
  } catch (error) {
    console.error("Offertsvaret kunde inte sparas", error);
    return { ok: false, error: "Något gick fel. Försök igen." };
  }
}
