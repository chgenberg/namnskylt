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
const LOGO_SEK = 9;
export const VAT_RATE = 0.25;

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

function quantityOf(doc: BadgeDocument): number {
  return Math.max(1, Math.floor(doc.quantity));
}

function listPriceSek(doc: BadgeDocument): number {
  const areaCm2 = (doc.size.widthMm * doc.size.heightMm) / 100;
  const extraArea = Math.max(0, Math.ceil(areaCm2 - BASE_AREA_CM2));
  const extraRows = Math.max(0, engravedRows(doc).length - 1);
  return (
    getMaterial(doc.materialId).basePriceSek +
    extraArea * AREA_PRICE_SEK_PER_CM2 +
    extraRows * EXTRA_ROW_SEK +
    (doc.frame.style === "none" ? 0 : FRAME_SEK) +
    (doc.logo ? LOGO_SEK : 0) +
    getMounting(doc.mounting).priceSek
  );
}

/**
 * Hela ordern prissätts tillsammans: mängdrabatten gäller orderns totala
 * antal, så 30 olika namn får samma rabatt som 30 likadana skyltar.
 * `unitSek` är snittpriset per skylt.
 */
export function priceOrder(docs: readonly BadgeDocument[]): PriceBreakdown {
  const quantity = docs.reduce((sum, doc) => sum + quantityOf(doc), 0);
  const tier = tierFor(quantity);
  const units = lineUnitPrices(docs);
  const totalSek = docs.reduce((sum, doc, i) => sum + (units[i] ?? 0) * quantityOf(doc), 0);
  return {
    unitSek: quantity > 0 ? Math.round(totalSek / quantity) : 0,
    totalSek,
    totalInclVatSek: Math.round(totalSek * (1 + VAT_RATE)),
    tier,
    quantity,
  };
}

/** À-pris per skylt i ordern, med mängdrabatten för orderns totala antal. */
export function lineUnitPrices(docs: readonly BadgeDocument[]): number[] {
  const tier = tierFor(docs.reduce((sum, doc) => sum + quantityOf(doc), 0));
  return docs.map((doc) => Math.round(listPriceSek(doc) * tier.factor));
}

export function priceBadge(doc: BadgeDocument): PriceBreakdown {
  return priceOrder([doc]);
}
