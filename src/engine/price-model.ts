import { z } from "zod";
import {
  NO_SHIPPING,
  priceItems,
  tierIndexFor,
  toOre,
  unitPriceParts,
  withShippingMethod,
  type PriceItem,
  type PriceOptionId,
  type PriceOptions,
  type PricePart,
  type PriceTable,
  type ShippingMethod,
  type ShippingRule,
} from "./pricing";
import type { SignClass } from "./types";

/**
 * Prismodellen. Alla belopp är exkl. moms. Det återförsäljaren betalar får
 * ha ören; slutkundens priser är hela kronor.
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
 * (`PriceTable` i `pricing.ts`), och det är bara listorna som går vidare.
 * Filen exporteras därför inte från `@/engine`: bara serverkod, adminverktyget
 * för prismodellen och tester får importera den. Annars hamnar provisionen i
 * JavaScript som alla besökare laddar. `price-lists.test.ts` kontrollerar det.
 */

const PRICE_TIER_COUNT = 4;

export interface PriceTier {
  /** Trappsteget gäller när ordern har fler skyltar än så. Första steget är alltid 0. */
  moreThan: number;
  /**
   * Plattformens andel av det återförsäljaren betalar, i procent. Den gäller
   * bara skyltarna inom steget: i en order på 250 skyltar ger de första 100
   * första stegets procent och de övriga 150 andra stegets.
   */
  provisionPercent: number;
}

export interface PriceModel {
  /** Trappsteg på orderns totala antal, stigande. */
  tiers: PriceTier[];
  /** Återförsäljarens pris per skylt, ett tal per trappsteg. */
  signs: Record<SignClass, number[]>;
  /** Tillbehör och tillval per skylt, återförsäljarens pris, ett tal per trappsteg. */
  options: PriceOptions;
  /**
   * Startkostnaden för en order, det återförsäljaren betalar. Den fördelas på
   * orderns skyltar: 200 kr på 4 skyltar lägger 50 kr på varje skylt.
   */
  startSek: number;
  /** Minsta belopp återförsäljaren betalar för en order. */
  minOrderSek: number;
  /** Slutkundens pris = återförsäljarens pris / (1 − marginalen). */
  endMarginPercent: number;
  /** Minsta belopp slutkunden betalar för en order. */
  endMinOrderSek: number;
  /**
   * Frakten per order: Skylt & Gravyrtekniks prislista rakt av. Den ligger
   * utanför kedjan ovan. Återförsäljaren och slutkunden betalar samma belopp,
   * utan provision och utan marginal, och allt går till verkstaden.
   */
  shipping: ShippingRule;
}

export const MAX_PRICE_SEK = 100_000;
/** Vid 100 % går priset mot oändligheten. */
export const MAX_MARGIN_PERCENT = 90;

/** Slutkundens belopp: hela kronor. */
const sekSchema = z.number().int().min(0).max(MAX_PRICE_SEK);
/** Återförsäljarens belopp: kronor med högst två decimaler. */
const oreSchema = z
  .number()
  .min(0)
  .max(MAX_PRICE_SEK)
  .refine((sek) => Math.abs(sek * 100 - Math.round(sek * 100)) < 1e-6, "Ett belopp får ha högst två decimaler");
const percentSchema = z.number().min(0).max(MAX_MARGIN_PERCENT);
const tierPricesSchema = z.array(oreSchema).length(PRICE_TIER_COUNT);

export const priceModelSchema = z
  .object({
    tiers: z
      .array(z.object({ moreThan: z.number().int().min(0).max(1_000_000), provisionPercent: percentSchema }))
      .length(PRICE_TIER_COUNT),
    signs: z.object({ premium: tierPricesSchema, standard: tierPricesSchema }),
    options: z.object({
      customShape: tierPricesSchema,
      extraEngraving: tierPricesSchema,
      pin: tierPricesSchema,
      clip: tierPricesSchema,
      magnet: tierPricesSchema,
      markingEngrave: tierPricesSchema,
      markingPrint: tierPricesSchema,
      markingEngraveNamePrintLogo: tierPricesSchema,
      markingPrintNameEngraveLogo: tierPricesSchema,
    }),
    startSek: oreSchema,
    minOrderSek: oreSchema,
    endMarginPercent: percentSchema,
    endMinOrderSek: sekSchema,
    // Frakten är hela kronor: slutkunden betalar den, och slutkundens belopp har inga ören.
    shipping: z.object({ letterSek: sekSchema, parcelSek: sekSchema, letterMaxSek: sekSchema }),
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

/** Märkningsmetodernas prisrader. De kom till 2026-11-16; en modell sparad före dess saknar dem. */
const MARKING_OPTION_IDS = [
  "markingEngrave",
  "markingPrint",
  "markingEngraveNamePrintLogo",
  "markingPrintNameEngraveLogo",
] as const satisfies readonly PriceOptionId[];
const OPTION_IDS = ["customShape", "extraEngraving", "pin", "clip", "magnet", ...MARKING_OPTION_IDS] as const satisfies readonly PriceOptionId[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * En modell sparad före 2026-11-13 har ett enda pris per tillval och ingen
 * startkostnad. Den läses som samma pris på alla trappsteg och startkostnad 0,
 * så att ordrar och offerter från den tiden behåller exakt sina priser. En
 * modell sparad före 2026-11-14 saknar frakt och läses utan, av samma skäl.
 * En modell sparad före 2026-11-16 saknar märkningsmetodernas rader och läses
 * med 0 kr på alla fyra, alltså att metoden ingår i skylten.
 */
function upgradeStoredModel(value: unknown): unknown {
  if (!isRecord(value)) return value;
  const options = isRecord(value.options)
    ? {
        ...Object.fromEntries(MARKING_OPTION_IDS.map((id) => [id, Array(PRICE_TIER_COUNT).fill(0)])),
        ...Object.fromEntries(
          Object.entries(value.options).map(([id, price]) => [id, typeof price === "number" ? Array(PRICE_TIER_COUNT).fill(price) : price]),
        ),
      }
    : value.options;
  return { ...value, options, startSek: value.startSek ?? 0, shipping: value.shipping ?? NO_SHIPPING };
}

/** Läser en sparad modell, även en i det äldre formatet. `null` när värdet inte är en prismodell. */
export function parseStoredPriceModel(value: unknown): PriceModel | null {
  const parsed = priceModelSchema.safeParse(upgradeStoredModel(value));
  return parsed.success ? parsed.data : null;
}

/** Slutkundens pris för ett belopp hos återförsäljaren. */
export function endPriceSek(resellerSek: number, model: PriceModel): number {
  return Math.round(resellerSek / (1 - model.endMarginPercent / 100));
}

function mapOptions(options: PriceOptions, price: (sek: number) => number): PriceOptions {
  const mapped = {} as PriceOptions;
  for (const id of OPTION_IDS) mapped[id] = options[id].map(price);
  return mapped;
}

/** Det återförsäljaren betalar. */
export function resellerPriceTable(model: PriceModel): PriceTable {
  return {
    tiers: model.tiers.map((tier) => tier.moreThan),
    signs: { premium: [...model.signs.premium], standard: [...model.signs.standard] },
    options: mapOptions(model.options, (sek) => sek),
    startSek: model.startSek,
    minOrderSek: model.minOrderSek,
    shipping: { ...model.shipping },
    ore: true,
  };
}

/**
 * Det slutkunden betalar. Varje belopp avrundas för sig, så att skylt, fäste
 * och logga i gränssnittet summerar till exakt det kunden betalar. Marginalen
 * gäller startkostnaden på samma sätt som priserna per skylt. Frakten är inte
 * med: den räknas på det återförsäljaren betalar (`orderShippingSek`), och
 * kunden betalar samma belopp.
 */
export function endPriceTable(model: PriceModel): PriceTable {
  const end = (sek: number) => endPriceSek(sek, model);
  return {
    tiers: model.tiers.map((tier) => tier.moreThan),
    signs: { premium: model.signs.premium.map(end), standard: model.signs.standard.map(end) },
    options: mapOptions(model.options, end),
    startSek: end(model.startSek),
    minOrderSek: model.endMinOrderSek,
  };
}

/**
 * Orderns frakt. Den är samma i alla led (beslut 2026-11-15): Skylt &
 * Gravyrtekniks regel gäller det återförsäljaren betalar verkstaden för
 * varorna, och kunden betalar samma belopp som återförsäljaren. Regeln gäller
 * standardfrakten; upphämtning och express har ingen frakt på ordern.
 */
export function orderShippingSek(model: PriceModel, items: readonly PriceItem[], method: ShippingMethod = "standard"): number {
  return priceItems(items, withShippingMethod(resellerPriceTable(model), method)).shippingSek;
}

export interface ProvisionSplit {
  /** Provisionen i snitt på hela ordern, i procent. Har decimaler när ordern går över flera trappsteg. */
  provisionPercent: number;
  /** Plattformens del av det återförsäljaren betalar. */
  provisionSek: number;
  /** Skylt & Gravyrtekniks del. */
  supplierSek: number;
}

/** Hur många av orderns skyltar som hamnar på varje trappsteg: 250 skyltar är 100 på första steget och 150 på andra. */
export function tierCounts(model: PriceModel, quantity: number): number[] {
  return model.tiers.map((tier, i) => {
    const upTo = model.tiers[i + 1]?.moreThan ?? Infinity;
    return Math.max(0, Math.min(quantity, upTo) - tier.moreThan);
  });
}

/**
 * Provisionen för en order, i procent av det återförsäljaren betalar. Den
 * räknas steg för steg: varje trappstegs procent gäller bara skyltarna inom
 * steget, så en order på 101 skyltar ger aldrig lägre procent på de första
 * 100. Resultatet är snittet över orderns skyltar och gäller hela beloppet,
 * även fästen, tillval, startkostnad och minidebitering.
 */
export function provisionPercentFor(model: PriceModel, quantity: number): number {
  if (quantity <= 0) return model.tiers[0]?.provisionPercent ?? 0;
  const weighted = tierCounts(model, quantity).reduce((sum, count, i) => sum + count * (model.tiers[i]?.provisionPercent ?? 0), 0);
  return weighted / quantity;
}

/**
 * Lägsta och högsta provision i procent för en order på ett trappsteg: vid
 * stegets första och sista antal. Sista steget har inget sista antal; där går
 * provisionen mot stegets egen procent när ordern växer.
 */
export function provisionPercentRange(model: PriceModel, tierIndex: number): { min: number; max: number } {
  const tier = model.tiers[tierIndex];
  if (!tier) return { min: 0, max: 0 };
  const next = model.tiers[tierIndex + 1];
  const first = provisionPercentFor(model, tier.moreThan + 1);
  const last = next ? provisionPercentFor(model, next.moreThan) : tier.provisionPercent;
  return { min: Math.min(first, last), max: Math.max(first, last) };
}

/**
 * Fördelningen av varuvärdet återförsäljaren betalar för en order
 * (`TablePrice.goodsSek`). Provisionen räknas steg för steg, med ören. Frakten
 * är inte med: den har ingen provision och går oavkortad till verkstaden.
 */
export function provisionSplit(model: PriceModel, resellerGoodsSek: number, quantity: number): ProvisionSplit {
  const provisionPercent = provisionPercentFor(model, quantity);
  const provisionSek = toOre((resellerGoodsSek * provisionPercent) / 100);
  return { provisionPercent, provisionSek, supplierSek: toOre(resellerGoodsSek - provisionSek) };
}

/** Hur ett belopp fördelas mellan parterna, med ören. */
export interface PartShare {
  /** Det återförsäljaren betalar. */
  resellerSek: number;
  /** Plattformens provision på beloppet. */
  provisionSek: number;
  /** Skylt & Gravyrtekniks del. */
  supplierSek: number;
  /** Det slutkunden betalar. */
  endSek: number;
}

function shareOf(resellerSek: number, endSek: number, provisionPercent: number): PartShare {
  const provisionSek = toOre((resellerSek * provisionPercent) / 100);
  return { resellerSek: toOre(resellerSek), provisionSek, supplierSek: toOre(resellerSek - provisionSek), endSek };
}

/** Fördelningen av ett pris hos återförsäljaren vid en viss provision — den gäller skyltar, fästen, tillval och startkostnad lika. */
export function partShare(model: PriceModel, resellerSek: number, provisionPercent: number): PartShare {
  return shareOf(resellerSek, endPriceSek(resellerSek, model), provisionPercent);
}

export interface ItemBreakdown {
  tierIndex: number;
  provisionPercent: number;
  /** Delarna som ingår i skylten, per skylt. */
  parts: { part: PricePart; share: PartShare }[];
  /** Summan av delarna, per skylt. */
  perSign: PartShare;
  /** Påslaget upp till minsta ordervärde, för hela ordern. Noll när ordern redan når dit. */
  minimum: PartShare;
}

/** Specifikationen för en orderrad: vad varje part får för skylten, fästet och tillvalen. */
export function itemBreakdown(model: PriceModel, item: PriceItem): ItemBreakdown {
  const quantity = Math.max(1, Math.floor(item.quantity));
  const purchase = resellerPriceTable(model);
  const tierIndex = tierIndexFor(quantity, purchase);
  const provisionPercent = provisionPercentFor(model, quantity);
  // Slutkundens del läses ur slutkundens prislista, del för del. Startkostnaden räknas alltså ur slutkundens
  // startkostnad och inte ur återförsäljarens del.
  // Delarna paras ihop på namn: en del som avrundas till 0 kr för slutkunden finns bara i återförsäljarens lista.
  const endParts = unitPriceParts(item, quantity, endPriceTable(model));
  const endSek = (part: PricePart) => endParts.find((end) => end.part === part)?.sek ?? 0;
  const parts = unitPriceParts(item, quantity, purchase).map(({ part, sek }) => ({
    part,
    share: shareOf(sek, endSek(part), provisionPercent),
  }));
  const sum = (pick: (share: PartShare) => number) => toOre(parts.reduce((total, { share }) => total + pick(share), 0));
  const perSign: PartShare = {
    resellerSek: sum((s) => s.resellerSek),
    provisionSek: sum((s) => s.provisionSek),
    supplierSek: sum((s) => s.supplierSek),
    endSek: sum((s) => s.endSek),
  };
  const minimum = shareOf(
    Math.max(0, model.minOrderSek - perSign.resellerSek * quantity),
    Math.max(0, model.endMinOrderSek - perSign.endSek * quantity),
    provisionPercent,
  );
  return { tierIndex, provisionPercent, parts, perSign, minimum };
}
