import { z } from "zod";
import { MOUNTINGS, getMaterial } from "./catalog";
import type { BadgeDocument, MaterialId, MountingId, SignClass } from "./types";

/**
 * Prismodellen. Alla belopp är exkl. moms, i hela kronor.
 *
 * Tre parter delar på en order: Skylt & Gravyrteknik tillverkar, plattformen
 * tar provision och återförsäljaren säljer till slutkund. Tabellen anger vad
 * återförsäljaren betalar. Provisionen är plattformens andel av det beloppet
 * och resten går till verkstaden. Slutkundens pris räknas ur återförsäljarens
 * med en marginal.
 *
 * Siffrorna ändras i admin. Varje order och offert sparar modellen som gällde,
 * så en senare ändring räknar aldrig om något som redan är beställt.
 */

const PRICE_TIER_COUNT = 4;
export const VAT_RATE = 0.25;

export interface PriceTier {
  /** Trappsteget gäller när ordern har fler skyltar än så. Första steget är alltid 0. */
  moreThan: number;
  /** Plattformens andel av det återförsäljaren betalar, i procent. */
  provisionPercent: number;
}

export interface PriceOptions {
  /** Egen form upp till 12 × 12 cm. */
  customShape: number;
  /** Extra gravyr eller print — i dag loggan. */
  extraEngraving: number;
  pin: number;
  clip: number;
  magnet: number;
}

export interface PriceModel {
  /** Trappsteg på orderns totala antal, stigande. */
  tiers: PriceTier[];
  /** Återförsäljarens pris per skylt, ett tal per trappsteg. */
  signs: Record<SignClass, number[]>;
  /** Tillval per skylt, återförsäljarens pris. */
  options: PriceOptions;
  /** Minsta belopp återförsäljaren betalar för en order. */
  minOrderSek: number;
  /** Slutkundens pris = återförsäljarens pris / (1 − marginalen). */
  endMarginPercent: number;
  /** Minsta belopp slutkunden betalar för en order. */
  endMinOrderSek: number;
}

/** Kalkylen från 2026-11-13. Gäller tills något annat sparats i admin. */
export const DEFAULT_PRICE_MODEL: PriceModel = {
  tiers: [
    { moreThan: 0, provisionPercent: 15 },
    { moreThan: 100, provisionPercent: 12 },
    { moreThan: 300, provisionPercent: 10 },
    { moreThan: 500, provisionPercent: 8 },
  ],
  signs: {
    premium: [73, 68, 64, 61],
    standard: [54, 50, 47, 43],
  },
  options: { customShape: 19, extraEngraving: 19, pin: 5, clip: 9, magnet: 11 },
  minOrderSek: 299,
  endMarginPercent: 40,
  endMinOrderSek: 299,
};

export const MAX_PRICE_SEK = 100_000;
/** Vid 100 % går priset mot oändligheten. */
export const MAX_MARGIN_PERCENT = 90;

const sekSchema = z.number().int().min(0).max(MAX_PRICE_SEK);
const percentSchema = z.number().min(0).max(MAX_MARGIN_PERCENT);
const tierPricesSchema = z.array(sekSchema).length(PRICE_TIER_COUNT);

export const priceModelSchema = z
  .object({
    tiers: z
      .array(z.object({ moreThan: z.number().int().min(0).max(1_000_000), provisionPercent: percentSchema }))
      .length(PRICE_TIER_COUNT),
    signs: z.object({ premium: tierPricesSchema, standard: tierPricesSchema }),
    options: z.object({
      customShape: sekSchema,
      extraEngraving: sekSchema,
      pin: sekSchema,
      clip: sekSchema,
      magnet: sekSchema,
    }),
    minOrderSek: sekSchema,
    endMarginPercent: percentSchema,
    endMinOrderSek: sekSchema,
  })
  .superRefine((model, ctx) => {
    if (model.tiers[0]?.moreThan !== 0) {
      ctx.addIssue({ code: "custom", path: ["tiers", 0, "moreThan"], message: "Första trappsteget börjar på 0" });
    }
    model.tiers.forEach((tier, i) => {
      const previous = model.tiers[i - 1];
      if (previous && tier.moreThan <= previous.moreThan) {
        ctx.addIssue({ code: "custom", path: ["tiers", i, "moreThan"], message: "Trappstegen ska stiga" });
      }
    });
  }) satisfies z.ZodType<PriceModel>;

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

function totalQuantity(items: readonly PriceItem[]): number {
  return items.reduce((sum, item) => sum + quantityOf(item), 0);
}

/** Trappsteget för orderns totala antal — 30 olika namn räknas som 30 skyltar. */
export function tierIndexFor(quantity: number, model: PriceModel): number {
  return model.tiers.reduce((index, tier, i) => (quantity > tier.moreThan ? i : index), 0);
}

/** Skyltens delar till återförsäljarens pris på ett trappsteg. */
function resellerParts(item: PriceItem, tierIndex: number, model: PriceModel): number[] {
  return [
    model.signs[item.signClass][tierIndex] ?? 0,
    mountingResellerSek(item.mounting, model),
    item.extraEngraving ? model.options.extraEngraving : 0,
    item.customShape ? model.options.customShape : 0,
  ];
}

/** Slutkundens pris för ett belopp hos återförsäljaren. */
export function endPriceSek(resellerSek: number, model: PriceModel): number {
  return Math.round(resellerSek / (1 - model.endMarginPercent / 100));
}

const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);

export interface ResellerBreakdown {
  /** À-pris per rad. */
  unitSek: number[];
  quantity: number;
  tierIndex: number;
  badgesSek: number;
  /** Påslaget upp till minsta ordervärde; 0 när ordern redan når dit. */
  minimumTopUpSek: number;
  /** Det återförsäljaren betalar. */
  totalSek: number;
  provisionPercent: number;
  /** Plattformens del. */
  provisionSek: number;
  /** Skylt & Gravyrtekniks del. */
  supplierSek: number;
}

/** Vad återförsäljaren betalar för ordern och hur beloppet delas mellan plattformen och verkstaden. */
export function resellerPriceOf(items: readonly PriceItem[], model: PriceModel): ResellerBreakdown {
  const quantity = totalQuantity(items);
  const tierIndex = tierIndexFor(quantity, model);
  const unitSek = items.map((item) => sum(resellerParts(item, tierIndex, model)));
  const badgesSek = items.reduce((total, item, i) => total + (unitSek[i] ?? 0) * quantityOf(item), 0);
  const minimumTopUpSek = quantity > 0 ? Math.max(0, model.minOrderSek - badgesSek) : 0;
  const totalSek = badgesSek + minimumTopUpSek;
  const provisionPercent = model.tiers[tierIndex]?.provisionPercent ?? 0;
  const provisionSek = Math.round((totalSek * provisionPercent) / 100);
  return {
    unitSek,
    quantity,
    tierIndex,
    badgesSek,
    minimumTopUpSek,
    totalSek,
    provisionPercent,
    provisionSek,
    supplierSek: totalSek - provisionSek,
  };
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

/**
 * Slutkundens à-pris per rad. Varje del avrundas för sig, så att skylt, fäste
 * och logga i gränssnittet summerar till exakt det kunden betalar.
 */
function endUnitPricesOf(items: readonly PriceItem[], model: PriceModel): number[] {
  const tierIndex = tierIndexFor(totalQuantity(items), model);
  return items.map((item) => sum(resellerParts(item, tierIndex, model).map((part) => endPriceSek(part, model))));
}

/** Slutkundens listpris för ordern. */
export function endPriceOf(items: readonly PriceItem[], model: PriceModel): PriceBreakdown {
  const quantity = totalQuantity(items);
  const units = endUnitPricesOf(items, model);
  const badgesSek = items.reduce((total, item, i) => total + (units[i] ?? 0) * quantityOf(item), 0);
  const minimumTopUpSek = quantity > 0 ? Math.max(0, model.endMinOrderSek - badgesSek) : 0;
  const totalSek = badgesSek + minimumTopUpSek;
  return {
    unitSek: quantity > 0 ? Math.round(badgesSek / quantity) : 0,
    quantity,
    tierIndex: tierIndexFor(quantity, model),
    badgesSek,
    minimumTopUpSek,
    totalSek,
    totalInclVatSek: Math.round(totalSek * (1 + VAT_RATE)),
  };
}

/**
 * Hela ordern prissätts tillsammans: trappsteget gäller orderns totala antal,
 * så 30 olika namn får samma pris som 30 likadana skyltar.
 */
export function priceOrder(docs: readonly BadgeDocument[], model: PriceModel): PriceBreakdown {
  return endPriceOf(docs.map(priceItemOf), model);
}

/** Slutkundens à-pris per skylt i ordern. */
export function lineUnitPrices(docs: readonly BadgeDocument[], model: PriceModel): number[] {
  return endUnitPricesOf(docs.map(priceItemOf), model);
}

export function priceBadge(doc: BadgeDocument, model: PriceModel): PriceBreakdown {
  return priceOrder([doc], model);
}

/** Vad återförsäljaren betalar för skyltarna. */
export function resellerOrder(docs: readonly BadgeDocument[], model: PriceModel): ResellerBreakdown {
  return resellerPriceOf(docs.map(priceItemOf), model);
}

/** Återförsäljarens pris för ett fäste. */
export function mountingResellerSek(mounting: MountingId, model: PriceModel): number {
  return model.options[MOUNTING_OPTION[mounting]];
}

/** Slutkundens pris för ett fäste — det som läggs på skyltpriset. */
export function mountingPriceSek(mounting: MountingId, model: PriceModel): number {
  return endPriceSek(mountingResellerSek(mounting, model), model);
}

/** Lägsta slutkundspris för en skylt i materialet på ett trappsteg: skylten med det billigaste fästet som säljs. */
export function fromPriceSek(materialId: MaterialId, model: PriceModel, tierIndex = 0): number {
  const cheapestMounting = Math.min(...MOUNTINGS.filter((m) => m.offered).map((m) => mountingPriceSek(m.id, model)));
  return endPriceSek(model.signs[signClassOf(materialId)][tierIndex] ?? 0, model) + cheapestMounting;
}

/** Trappstegets antal som text: `1–100 st`, `501 st eller fler`. */
export function tierRangeLabel(tierIndex: number, model: PriceModel): string {
  const from = (model.tiers[tierIndex]?.moreThan ?? 0) + 1;
  const next = model.tiers[tierIndex + 1];
  return next ? `${from}–${next.moreThan} st` : `${from} st eller fler`;
}
