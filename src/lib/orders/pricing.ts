import { z } from "zod";
import { lineUnitPrices, VAT_RATE, type BadgeDocument, type PriceTable } from "@/engine";

/** En egen rad utöver skyltarna, t.ex. framtagning av korrektur eller expressorder. */
export interface PriceExtra {
  label: string;
  amountSek: number;
}

/**
 * Återförsäljarens egna priser på en order eller offert: à-pris per skylt
 * (`null` = listpris), en rabatt på skyltarna och extra kostnader.
 * Ingen prissättning = listpris.
 */
export interface Pricing {
  unitOverrides: (number | null)[];
  discountPercent: number;
  extras: PriceExtra[];
}

export const MAX_DISCOUNT_PERCENT = 100;
export const MAX_UNIT_SEK = 100_000;
export const MAX_EXTRAS = 10;

const priceExtraSchema = z.object({
  label: z.string().trim().min(1).max(80),
  amountSek: z.number().int().min(0).max(MAX_UNIT_SEK),
});

export const pricingSchema = z.object({
  unitOverrides: z.array(z.number().int().min(0).max(MAX_UNIT_SEK).nullable()).max(200),
  discountPercent: z.number().min(0).max(MAX_DISCOUNT_PERCENT),
  // Priser sparade före extrarader saknar fältet.
  extras: z.array(priceExtraSchema).max(MAX_EXTRAS).default([]),
});

export const NO_PRICING: Pricing = { unitOverrides: [], discountPercent: 0, extras: [] };

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
  /** Listpris för skyltarna — för att visa hur mycket kunden sparar. */
  listTotalSek: number;
  discountPercent: number;
  discountSek: number;
  /** Skyltarna efter alla rabatter. */
  badgesSek: number;
  /** Skillnaden mot listpris, oavsett om den kommer från à-pris eller rabatt. */
  savingsSek: number;
  savingsPercent: number;
  extras: PriceExtra[];
  extrasSek: number;
  /** Påslaget upp till slutkundens minsta ordervärde; 0 när ordern redan når dit. */
  minimumTopUpSek: number;
  /** Varuvärdet: skyltar, extrarader och påslaget, utan frakt. */
  goodsSek: number;
  /** Orderns frakt, samma belopp som återförsäljaren betalar. 0 kr för en order från före frakten. */
  shippingSek: number;
  /** Varuvärdet plus frakten. */
  totalSek: number;
  vatSek: number;
  totalInclVatSek: number;
}

/**
 * Orderns pris till kunden. `priceList` är slutkundens prislista som gällde när
 * ordern eller offerten skapades — listpriserna och minsta ordervärdet kommer därifrån.
 * `shippingSek` är orderns frakt. Den beror bara på skyltarna, aldrig på
 * återförsäljarens egna priser, rabatter eller extrarader: en sparad order eller
 * offert bär den (`shippingSek`), och en ny räknar den med `orderShippingSek`.
 */
export function priceWithPricing(
  badges: readonly BadgeDocument[],
  pricing: Pricing | null,
  priceList: PriceTable,
  shippingSek: number,
): PricedTotals {
  const list = lineUnitPrices(badges, priceList);
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
  const badgesSek = subtotalSek - discountSek;
  const savingsSek = Math.max(0, listTotalSek - badgesSek);
  const extras = pricing?.extras ?? [];
  const extrasSek = extras.reduce((sum, e) => sum + e.amountSek, 0);
  const minimumTopUpSek = badges.length > 0 ? Math.max(0, priceList.minOrderSek - badgesSek - extrasSek) : 0;
  const goodsSek = badgesSek + extrasSek + minimumTopUpSek;
  const totalSek = goodsSek + shippingSek;
  const vatSek = Math.round(totalSek * VAT_RATE);
  return {
    lines,
    subtotalSek,
    listTotalSek,
    discountPercent,
    discountSek,
    badgesSek,
    savingsSek,
    savingsPercent: listTotalSek > 0 ? Math.round((savingsSek / listTotalSek) * 1000) / 10 : 0,
    extras,
    extrasSek,
    minimumTopUpSek,
    goodsSek,
    shippingSek,
    totalSek,
    vatSek,
    totalInclVatSek: totalSek + vatSek,
  };
}

/** À-pris per skylt så att skyltarna tillsammans får `percent` rabatt mot listpris. */
export function unitsForDiscount(listUnits: readonly number[], percent: number): number[] {
  const factor = 1 - Math.min(MAX_DISCOUNT_PERCENT, Math.max(0, percent)) / 100;
  return listUnits.map((unit) => Math.round(unit * factor));
}

/** Rabatten mot listpris som à-priserna ger, med en decimal. */
export function discountForUnits(listUnits: readonly number[], units: readonly number[], quantities: readonly number[]): number {
  const list = listUnits.reduce((sum, unit, i) => sum + unit * (quantities[i] ?? 1), 0);
  const sale = units.reduce((sum, unit, i) => sum + unit * (quantities[i] ?? 1), 0);
  return list > 0 ? Math.max(0, Math.round((1 - sale / list) * 1000) / 10) : 0;
}

/** Sparas bara när något faktiskt avviker från listpriset. */
export function isCustomPricing(pricing: Pricing | null): pricing is Pricing {
  return Boolean(
    pricing && (pricing.discountPercent > 0 || pricing.unitOverrides.some((u) => u != null) || pricing.extras.length > 0),
  );
}
