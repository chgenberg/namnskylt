"use server";

import { z } from "zod";
import { customerPoSchema } from "@/lib/orders/customer-po";
import { deliveryAddressSchema, deliveryInstructionsSchema, deliveryPhoneIssue, shippingMethodOf, shippingMethodSchema } from "@/lib/orders/delivery";
import { declineByCustomer } from "@/lib/quotes/accept";
import { acceptCustomerQuote } from "@/lib/quotes/customer-quote";
import { canCustomerAnswer } from "@/lib/quotes/model";
import { getQuoteByToken } from "@/lib/quotes/repository";

const decisionSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/),
  accept: z.boolean(),
  reason: z.string().trim().max(1000).optional(),
  /** Leveransadressen, när skyltarna ska till kunden. */
  delivery: deliveryAddressSchema.optional(),
  /** Leveranssättet kunden valde. Utelämnat = det som står på offerten. */
  method: shippingMethodSchema.optional(),
  /** Leveransspecifikationen kunden skrev. Utelämnad = den som står på offerten. */
  instructions: deliveryInstructionsSchema.optional(),
  /** Kundens eget inköpsnummer. Utelämnat = det som står på offerten. */
  customerPo: customerPoSchema,
  /**
   * Kundens uppgifter, när offerten saknar kund i registret: en offert som kunden laddade ner själv
   * utan att fylla i något. Samma uppgifter som i kassan. De prövas i `acceptCustomerQuote`.
   */
  customer: z
    .object({
      company: z.string().trim().max(120),
      orgNumber: z.string().trim().max(20),
      name: z.string().trim().max(120),
      email: z.email("Skriv en e-postadress").max(200),
    })
    .optional(),
});

/** Publik — länkens token är behörigheten. Godkänd offert blir en order direkt. */
export async function decideQuoteAction(
  input: z.input<typeof decisionSchema>,
): Promise<{ ok: boolean; error?: string; orderNo?: string; orderPath?: string | null }> {
  const parsed = decisionSchema.safeParse(input);
  if (!parsed.success) {
    const field = parsed.error.issues[0];
    // Adressens fel är skrivna för kunden; övriga fel beror på en trasig sida.
    const shown = field?.path[0] === "delivery" || field?.path[0] === "customerPo" || field?.path[0] === "customer" || field?.path[0] === "instructions";
    return { ok: false, error: shown && field ? field.message : "Ogiltigt svar" };
  }
  const { token, accept, reason, delivery, method, customerPo, customer, instructions } = parsed.data;
  try {
    const quote = await getQuoteByToken(token);
    if (!quote || !canCustomerAnswer(quote)) return { ok: false, error: "Offerten går inte att besvara längre" };
    if (!accept) {
      const ok = await declineByCustomer(quote, reason || null);
      return ok ? { ok: true } : { ok: false, error: "Offerten är redan besvarad" };
    }
    // Adressen kunden fyller i nu ska ha telefon när skyltarna fraktas, med fraktsättet som gäller för ordern.
    const phoneIssue = deliveryPhoneIssue(delivery, method ?? shippingMethodOf(quote.delivery));
    if (phoneIssue) return { ok: false, error: phoneIssue };
    // En offert som kunden laddade ner själv får sin kund nu, med uppgifterna kunden fyller i, och godkänns sedan.
    const result = await acceptCustomerQuote(quote, customer ?? null, delivery ?? null, method ?? null, customerPo ?? null, instructions);
    // Kunden får numret den ser på sin order: verkstadens när de själva säljer, annars säljarens.
    return result.ok ? { ok: true, orderNo: result.customerNumber, orderPath: result.orderPath } : { ok: false, error: result.error };
  } catch (error) {
    console.error("Offertsvaret kunde inte sparas", error);
    return { ok: false, error: "Något gick fel. Försök igen." };
  }
}
