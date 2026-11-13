import { z } from "zod";
import {
  mountingPriceSek,
  optionPriceSek,
  startShareSek,
  tierIndexFor,
  type PriceItem,
  type PriceOptionId,
  type PriceOptions,
  type PriceTable,
} from "./pricing";
import type { SignClass } from "./types";

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
 * (`PriceTable` i `pricing.ts`), och det är bara listorna som går vidare.
 * Filen exporteras därför inte från `@/engine`: bara serverkod, adminverktyget
 * för prismodellen och tester får importera den. Annars hamnar provisionen i
 * JavaScript som alla besökare laddar. `price-lists.test.ts` kontrollerar det.
 */

const PRICE_TIER_COUNT = 4;

export interface PriceTier {
  /** Trappsteget gäller när ordern har fler skyltar än så. Första steget är alltid 0. */
  moreThan: number;
  /** Plattformens andel av det återförsäljaren betalar, i procent. */
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
      customShape: tierPricesSchema,
      extraEngraving: tierPricesSchema,
      pin: tierPricesSchema,
      clip: tierPricesSchema,
      magnet: tierPricesSchema,
    }),
    startSek: sekSchema,
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

const OPTION_IDS = ["customShape", "extraEngraving", "pin", "clip", "magnet"] as const satisfies readonly PriceOptionId[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * En modell sparad före 2026-11-13 har ett enda pris per tillval och ingen
 * startkostnad. Den läses som samma pris på alla trappsteg och startkostnad 0,
 * så att ordrar och offerter från den tiden behåller exakt sina priser.
 */
function upgradeStoredModel(value: unknown): unknown {
  if (!isRecord(value)) return value;
  const options = isRecord(value.options)
    ? Object.fromEntries(
        Object.entries(value.options).map(([id, price]) => [id, typeof price === "number" ? Array(PRICE_TIER_COUNT).fill(price) : price]),
      )
    : value.options;
  return { ...value, options, startSek: value.startSek ?? 0 };
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
  };
}

/**
 * Det slutkunden betalar. Varje belopp avrundas för sig, så att skylt, fäste
 * och logga i gränssnittet summerar till exakt det kunden betalar. Marginalen
 * gäller startkostnaden på samma sätt som priserna per skylt.
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

/** En del av skyltens pris: själva skylten, fästet, ett tillval eller skyltens del av startkostnaden. */
export type PricePart = "sign" | "mounting" | "extraEngraving" | "customShape" | "start";

/**
 * Hur ett belopp fördelas mellan parterna. Provisionen och verkstadens del har
 * ören: de avrundas först på orderns summa (`provisionSplit`), inte per del.
 */
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

const toOre = (sek: number) => Math.round(sek * 100) / 100;

function shareOf(resellerSek: number, endSek: number, provisionPercent: number): PartShare {
  const provisionSek = toOre((resellerSek * provisionPercent) / 100);
  return { resellerSek, provisionSek, supplierSek: toOre(resellerSek - provisionSek), endSek };
}

/** Fördelningen av ett pris hos återförsäljaren på ett trappsteg — provisionen gäller skyltar, fästen, tillval och startkostnad lika. */
export function partShare(model: PriceModel, resellerSek: number, tierIndex: number): PartShare {
  return shareOf(resellerSek, endPriceSek(resellerSek, model), model.tiers[tierIndex]?.provisionPercent ?? 0);
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
  const provisionPercent = model.tiers[tierIndex]?.provisionPercent ?? 0;
  const prices: [PricePart, number, boolean][] = [
    ["sign", purchase.signs[item.signClass][tierIndex] ?? 0, true],
    ["mounting", mountingPriceSek(item.mounting, purchase, tierIndex), true],
    ["extraEngraving", optionPriceSek("extraEngraving", purchase, tierIndex), item.extraEngraving],
    ["customShape", optionPriceSek("customShape", purchase, tierIndex), item.customShape],
  ];
  const parts = prices.filter(([, , included]) => included).map(([part, sek]) => ({ part, share: partShare(model, sek, tierIndex) }));
  // Slutkundens del räknas ur slutkundens startkostnad, precis som i prislistan, inte ur återförsäljarens del.
  if (model.startSek > 0) {
    const share = shareOf(startShareSek(quantity, purchase), startShareSek(quantity, endPriceTable(model)), provisionPercent);
    parts.push({ part: "start", share });
  }
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
