import { MOUNTINGS, getMaterial } from "./catalog";
import type { BadgeDocument, MaterialId, MountingId, SignClass } from "./types";

/**
 * Prisräkning ur en prislista. Alla belopp är exkl. moms, i hela kronor.
 *
 * En prislista (`PriceTable`) är vad en part betalar: slutkundens lista får
 * alla besökare, återförsäljarens lista får bara en inloggad återförsäljare.
 * Listorna härleds på servern ur prismodellen i `price-model.ts`. Den filen
 * exporteras inte härifrån och hör inte hemma i kod som en besökares eller
 * återförsäljares webbläsare laddar.
 */

export const VAT_RATE = 0.25;

export interface PriceOptions {
  /** Egen form upp till 12 × 12 cm. */
  customShape: number;
  /** Extra gravyr eller print — i dag loggan. */
  extraEngraving: number;
  pin: number;
  clip: number;
  magnet: number;
}

/**
 * En parts prislista: vad den betalar per skylt på varje trappsteg, för
 * tillvalen och som minst för en order. Innehåller ingenting om de andra
 * parterna, så den kan skickas till den partens webbläsare.
 */
export interface PriceTable {
  /** Trappstegens gränser, stigande: steget gäller när ordern har fler skyltar än så. Första är 0. */
  tiers: number[];
  signs: Record<SignClass, number[]>;
  options: PriceOptions;
  minOrderSek: number;
}

/** Det som avgör en skylts pris. Kalkylen i admin räknar på samma underlag som en order. */
export interface PriceItem {
  signClass: SignClass;
  mounting: MountingId;
  extraEngraving: boolean;
  /** Skylten skärs i en egen form. */
  customShape: boolean;
  quantity: number;
}

/** Säkerhetsnålen säljs inte längre; en äldre skylt med den prissätts som nål. */
const MOUNTING_OPTION: Record<MountingId, "pin" | "clip" | "magnet"> = {
  pin: "pin",
  clip: "clip",
  magnet: "magnet",
  "safety-pin": "pin",
};

function signClassOf(materialId: MaterialId): SignClass {
  return getMaterial(materialId).priceClass;
}

function priceItemOf(doc: BadgeDocument): PriceItem {
  return {
    signClass: signClassOf(doc.materialId),
    mounting: doc.mounting,
    extraEngraving: Boolean(doc.logo),
    customShape: doc.shape === "custom",
    quantity: doc.quantity,
  };
}

function quantityOf(item: Pick<PriceItem, "quantity">): number {
  return Math.max(1, Math.floor(item.quantity));
}

/** Trappsteget för orderns totala antal — 30 olika namn räknas som 30 skyltar. */
export function tierIndexFor(quantity: number, table: PriceTable): number {
  return table.tiers.reduce((index, moreThan, i) => (quantity > moreThan ? i : index), 0);
}

/** Priset för ett fäste i listan — det som läggs på skyltpriset. */
export function mountingPriceSek(mounting: MountingId, table: PriceTable): number {
  return table.options[MOUNTING_OPTION[mounting]];
}

function unitPriceSek(item: PriceItem, tierIndex: number, table: PriceTable): number {
  return (
    (table.signs[item.signClass][tierIndex] ?? 0) +
    mountingPriceSek(item.mounting, table) +
    (item.extraEngraving ? table.options.extraEngraving : 0) +
    (item.customShape ? table.options.customShape : 0)
  );
}

export interface TablePrice {
  /** À-pris per rad. */
  unitSek: number[];
  quantity: number;
  tierIndex: number;
  badgesSek: number;
  /** Påslaget upp till minsta ordervärde; 0 när ordern redan når dit. */
  minimumTopUpSek: number;
  totalSek: number;
}

/**
 * Ordern enligt en prislista. Hela ordern prissätts tillsammans: trappsteget
 * gäller orderns totala antal, så 30 olika namn får samma pris som 30 likadana.
 */
export function priceItems(items: readonly PriceItem[], table: PriceTable): TablePrice {
  const quantity = items.reduce((total, item) => total + quantityOf(item), 0);
  const tierIndex = tierIndexFor(quantity, table);
  const unitSek = items.map((item) => unitPriceSek(item, tierIndex, table));
  const badgesSek = items.reduce((total, item, i) => total + (unitSek[i] ?? 0) * quantityOf(item), 0);
  const minimumTopUpSek = quantity > 0 ? Math.max(0, table.minOrderSek - badgesSek) : 0;
  return { unitSek, quantity, tierIndex, badgesSek, minimumTopUpSek, totalSek: badgesSek + minimumTopUpSek };
}

export interface PriceBreakdown {
  /** Snittpris per skylt, före påslaget upp till minsta ordervärde. */
  unitSek: number;
  quantity: number;
  tierIndex: number;
  badgesSek: number;
  /** Påslaget upp till minsta ordervärde; 0 när ordern redan når dit. */
  minimumTopUpSek: number;
  totalSek: number;
  totalInclVatSek: number;
}

/** Kundens pris för ordern enligt slutkundens lista. */
export function priceOrder(docs: readonly BadgeDocument[], list: PriceTable): PriceBreakdown {
  const price = priceItems(docs.map(priceItemOf), list);
  return {
    unitSek: price.quantity > 0 ? Math.round(price.badgesSek / price.quantity) : 0,
    quantity: price.quantity,
    tierIndex: price.tierIndex,
    badgesSek: price.badgesSek,
    minimumTopUpSek: price.minimumTopUpSek,
    totalSek: price.totalSek,
    totalInclVatSek: Math.round(price.totalSek * (1 + VAT_RATE)),
  };
}

/** Kundens à-pris per skylt i ordern. */
export function lineUnitPrices(docs: readonly BadgeDocument[], list: PriceTable): number[] {
  return priceItems(docs.map(priceItemOf), list).unitSek;
}

export function priceBadge(doc: BadgeDocument, list: PriceTable): PriceBreakdown {
  return priceOrder([doc], list);
}

/** Vad återförsäljaren betalar för skyltarna, enligt återförsäljarens lista. */
export function resellerOrder(docs: readonly BadgeDocument[], purchaseList: PriceTable): TablePrice {
  return priceItems(docs.map(priceItemOf), purchaseList);
}

/** Lägsta pris för en skylt i materialet på ett trappsteg: skylten med det billigaste fästet som säljs. */
export function fromPriceSek(materialId: MaterialId, list: PriceTable, tierIndex = 0): number {
  const cheapestMounting = Math.min(...MOUNTINGS.filter((m) => m.offered).map((m) => mountingPriceSek(m.id, list)));
  return (list.signs[signClassOf(materialId)][tierIndex] ?? 0) + cheapestMounting;
}

/** Trappstegets antal som text: `1–100 st`, `501 st eller fler`. */
export function tierRangeLabel(tierIndex: number, table: PriceTable): string {
  const from = (table.tiers[tierIndex] ?? 0) + 1;
  const next = table.tiers[tierIndex + 1];
  return next === undefined ? `${from} st eller fler` : `${from}–${next} st`;
}
