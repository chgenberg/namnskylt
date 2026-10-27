import { z } from "zod";
import { lineUnitPrices, VAT_RATE, type BadgeDocument } from "@/engine";

/**
 * Återförsäljarens egna priser på en order eller offert: à-pris per skylt
 * (`null` = listpris) och en rabatt på hela summan. Ingen prissättning = listpris.
 */
export interface Pricing {
  unitOverrides: (number | null)[];
  discountPercent: number;
}

export const MAX_DISCOUNT_PERCENT = 100;
export const MAX_UNIT_SEK = 100_000;

export const pricingSchema = z.object({
  unitOverrides: z.array(z.number().int().min(0).max(MAX_UNIT_SEK).nullable()).max(200),
  discountPercent: z.number().min(0).max(MAX_DISCOUNT_PERCENT),
});

export const NO_PRICING: Pricing = { unitOverrides: [], discountPercent: 0 };

export interface PricedLine {
  listUnitSek: number;
  unitSek: number;
  quantity: number;
  totalSek: number;
  overridden: boolean;
}

export interface PricedTotals {
  lines: PricedLine[];
  /** Summan av raderna före rabatt. */
  subtotalSek: number;
  /** Listpris för hela ordern — för att visa hur mycket kunden sparar. */
  listTotalSek: number;
  discountPercent: number;
  discountSek: number;
  totalSek: number;
  vatSek: number;
  totalInclVatSek: number;
}

export function priceWithPricing(badges: readonly BadgeDocument[], pricing: Pricing | null = null): PricedTotals {
  const list = lineUnitPrices(badges);
  const lines = badges.map((badge, i) => {
    const listUnitSek = list[i] ?? 0;
    const override = pricing?.unitOverrides[i];
    const unitSek = override ?? listUnitSek;
    const quantity = Math.max(1, Math.floor(badge.quantity));
    return { listUnitSek, unitSek, quantity, totalSek: unitSek * quantity, overridden: override != null && override !== listUnitSek };
  });
  const subtotalSek = lines.reduce((sum, l) => sum + l.totalSek, 0);
  const listTotalSek = lines.reduce((sum, l) => sum + l.listUnitSek * l.quantity, 0);
  const discountPercent = Math.min(MAX_DISCOUNT_PERCENT, Math.max(0, pricing?.discountPercent ?? 0));
  const discountSek = Math.round((subtotalSek * discountPercent) / 100);
  const totalSek = subtotalSek - discountSek;
  const vatSek = Math.round(totalSek * VAT_RATE);
  return { lines, subtotalSek, listTotalSek, discountPercent, discountSek, totalSek, vatSek, totalInclVatSek: totalSek + vatSek };
}

/** Sparas bara när något faktiskt avviker från listpriset. */
export function isCustomPricing(pricing: Pricing | null): pricing is Pricing {
  return Boolean(pricing && (pricing.discountPercent > 0 || pricing.unitOverrides.some((u) => u != null)));
}
