import { z } from "zod";

/** Vem som beställer i kassan. Ett företag faktureras, en privatperson betalar med kort. */
export const CUSTOMER_TYPES = ["company", "private"] as const;
export type CustomerType = (typeof CUSTOMER_TYPES)[number];

/**
 * Betalningen på en order som är betald med kort. En order utan betalning
 * faktureras. `reference` är betalningens id hos Stripe, som återbetalningar
 * och avstämning utgår från.
 */
export interface OrderPayment {
  method: "card";
  provider: "stripe";
  reference: string;
  /** Det som drogs, med moms, i ören. */
  amountOre: number;
  paidAt: string;
}

export const orderPaymentSchema = z.object({
  method: z.literal("card"),
  provider: z.literal("stripe"),
  reference: z.string().min(1).max(200),
  amountOre: z.number().int().positive(),
  paidAt: z.string().min(1),
});

/** Betalningen ur databasen; `null` för en order på faktura eller en rad som inte går att läsa. */
export function parsePayment(value: unknown): OrderPayment | null {
  const parsed = orderPaymentSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** Raden om betalningen på ordern och i orderbekräftelsen. */
export function paymentLabel(payment: OrderPayment | null): string {
  return payment ? "Betald med kort" : "Faktura";
}
