import { getMaterial, getMounting } from "./catalog";
import { engravedRows } from "./document";
import type { BadgeDocument } from "./types";

/**
 * Indikativ prismodell för mockupen. Ersätts av leverantörens prissvar när
 * API:t mot Skylt & Gravyrteknik är på plats — klienten ska aldrig vara
 * sanningen för det fakturerade priset.
 */

export interface QuantityTier {
  minQuantity: number;
  factor: number;
}

export const QUANTITY_TIERS: readonly QuantityTier[] = [
  { minQuantity: 200, factor: 0.6 },
  { minQuantity: 50, factor: 0.72 },
  { minQuantity: 10, factor: 0.85 },
  { minQuantity: 1, factor: 1 },
];

/** Kronor per påbörjad cm² utöver grundytan 70×25 mm. */
const AREA_PRICE_SEK_PER_CM2 = 0.9;
const BASE_AREA_CM2 = 17.5;
const EXTRA_ROW_SEK = 6;
const FRAME_SEK = 5;
const VAT_RATE = 0.25;

export interface PriceBreakdown {
  unitSek: number;
  totalSek: number;
  totalInclVatSek: number;
  tier: QuantityTier;
  quantity: number;
}

export function tierFor(quantity: number): QuantityTier {
  return QUANTITY_TIERS.find((t) => quantity >= t.minQuantity) ?? QUANTITY_TIERS.at(-1)!;
}

export function priceBadge(doc: BadgeDocument): PriceBreakdown {
  const quantity = Math.max(1, Math.floor(doc.quantity));
  const areaCm2 = (doc.size.widthMm * doc.size.heightMm) / 100;
  const extraArea = Math.max(0, Math.ceil(areaCm2 - BASE_AREA_CM2));
  const extraRows = Math.max(0, engravedRows(doc).length - 1);

  const list =
    getMaterial(doc.materialId).basePriceSek +
    extraArea * AREA_PRICE_SEK_PER_CM2 +
    extraRows * EXTRA_ROW_SEK +
    (doc.frame.style === "none" ? 0 : FRAME_SEK) +
    getMounting(doc.mounting).priceSek;

  const tier = tierFor(quantity);
  const unitSek = Math.round(list * tier.factor);
  const totalSek = unitSek * quantity;
  return {
    unitSek,
    totalSek,
    totalInclVatSek: Math.round(totalSek * (1 + VAT_RATE)),
    tier,
    quantity,
  };
}
