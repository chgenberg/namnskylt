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
 *
 * Hela modellen stannar på servern. Ur den härleds en prislista per part
 * (`PriceTable`): slutkundens lista får alla besökare, återförsäljarens lista
 * får bara en inloggad återförsäljare, och provisionen ser bara ägaren.
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

/** Slutkundens pris för ett belopp hos återförsäljaren. */
export function endPriceSek(resellerSek: number, model: PriceModel): number {
  return Math.round(resellerSek / (1 - model.endMarginPercent / 100));
}

/** Det återförsäljaren betalar. */
export function resellerPriceTable(model: PriceModel): PriceTable {
  return {
    tiers: model.tiers.map((tier) => tier.moreThan),
    signs: { premium: [...model.signs.premium], standard: [...model.signs.standard] },
    options: { ...model.options },
    minOrderSek: model.minOrderSek,
  };
}

/**
 * Det slutkunden betalar. Varje belopp avrundas för sig, så att skylt, fäste
 * och logga i gränssnittet summerar till exakt det kunden betalar.
 */
export function endPriceTable(model: PriceModel): PriceTable {
  const end = (sek: number) => endPriceSek(sek, model);
  return {
    tiers: model.tiers.map((tier) => tier.moreThan),
    signs: { premium: model.signs.premium.map(end), standard: model.signs.standard.map(end) },
    options: {
      customShape: end(model.options.customShape),
      extraEngraving: end(model.options.extraEngraving),
      pin: end(model.options.pin),
      clip: end(model.options.clip),
      magnet: end(model.options.magnet),
    },
    minOrderSek: model.endMinOrderSek,
  };
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

export interface ProvisionSplit {
  provisionPercent: number;
  /** Plattformens del av det återförsäljaren betalar. */
  provisionSek: number;
  /** Skylt & Gravyrtekniks del. */
  supplierSek: number;
}

/** Hur det återförsäljaren betalar delas mellan plattformen och verkstaden. Bara för ägaren. */
export function provisionSplit(model: PriceModel, resellerTotalSek: number, quantity: number): ProvisionSplit {
  const tierIndex = tierIndexFor(quantity, resellerPriceTable(model));
  const provisionPercent = model.tiers[tierIndex]?.provisionPercent ?? 0;
  const provisionSek = Math.round((resellerTotalSek * provisionPercent) / 100);
  return { provisionPercent, provisionSek, supplierSek: resellerTotalSek - provisionSek };
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
