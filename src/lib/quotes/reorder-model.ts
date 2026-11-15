import { isOfferedDocument, type BadgeDocument } from "@/engine";
import type { Pricing } from "@/lib/orders/pricing";

/** Det reglerna behöver veta om ordern. */
export interface ReorderSource {
  status: string;
  badges: readonly BadgeDocument[];
  /** Ordern är betald med kort. */
  paid: boolean;
  /** Kunden är borttagen, och raden står bara kvar för bokföringen. */
  erased: boolean;
}

/**
 * Hur kunden beställer fler skyltar från sin ordersida.
 * `quote` = kunden skriver namnen och får en offert att godkänna, med samma
 * design och på faktura. `designer` = kunden skickas till skyltmotorn med
 * designen: en order som betalades med kort går inte att fakturera, så nästa
 * betalas också där. `none` = det går inte: kunden är borttagen, ordern är tom
 * eller designen säljs inte längre.
 */
export type ReorderMode = "quote" | "designer" | "none";

export function reorderMode(order: ReorderSource): ReorderMode {
  const template = order.badges[0];
  if (order.erased || !template || !isOfferedDocument(template)) return "none";
  return order.paid ? "designer" : "quote";
}

/**
 * Priserna som följer med till en ny beställning. Rabatten i procent är ett
 * villkor kunden har fått och gäller igen. À-priser och extrarader hör till den
 * gamla orderns rader och antal, och följer inte med.
 */
export function reorderPricing(pricing: Pricing | null): Pricing | null {
  if (!pricing || pricing.discountPercent <= 0) return null;
  return { unitOverrides: [], discountPercent: pricing.discountPercent, extras: [] };
}
