import { MOUNTINGS, getMaterial } from "./catalog";
import { markingOf } from "./marking";
import type { BadgeDocument, MarkingMethod, MaterialId, MountingId, SignClass } from "./types";

/**
 * Prisräkning ur en prislista. Alla belopp är exkl. moms. Slutkundens belopp
 * är hela kronor; återförsäljarens får ha ören.
 *
 * En prislista (`PriceTable`) är vad en part betalar: slutkundens lista får
 * alla besökare, återförsäljarens lista får bara en inloggad återförsäljare.
 * Listorna härleds på servern ur prismodellen i `price-model.ts`. Den filen
 * exporteras inte härifrån och hör inte hemma i kod som en besökares eller
 * återförsäljares webbläsare laddar.
 */

export const VAT_RATE = 0.25;

/** Ett belopp i kronor med högst två decimaler. Summor av priser med ören avrundas hit, så att flyttalsfel aldrig syns. */
export function toOre(sek: number): number {
  return Math.round(sek * 100) / 100;
}

/**
 * Tillbehör och tillval som läggs på skyltpriset:
 * `customShape` är egen form upp till 12 × 12 cm, `extraEngraving` extra
 * gravyr eller print (i dag loggan), `frame` ramen (enkel eller dubbel, samma
 * pris), fästena, och de fyra märkningsmetoderna (`marking…`), där en skylt
 * alltid har exakt en.
 */
export type PriceOptionId =
  | "customShape"
  | "extraEngraving"
  | "frame"
  | "pin"
  | "clip"
  | "magnet"
  | "markingEngrave"
  | "markingPrint"
  | "markingEngraveNamePrintLogo"
  | "markingPrintNameEngraveLogo";

/** Pris per skylt för varje tillbehör och tillval, ett tal per trappsteg. */
export type PriceOptions = Record<PriceOptionId, number[]>;

/**
 * Frakten för en order, Skylt & Gravyrtekniks egen prislista rakt av: varubrev
 * upp till ett varuvärde, annars paket. Regeln gäller det återförsäljaren
 * betalar verkstaden för varorna, och frakten är sedan samma belopp i alla
 * led, utan provision och utan marginal. Nollor betyder att ordern saknar
 * frakt, vilket gäller ordrar och offerter från före 2026-11-14.
 */
export interface ShippingRule {
  /** Varubrev (PostNord), för en order med varuvärde upp till `letterMaxSek`. */
  letterSek: number;
  /** Paket (DHL), för en order över gränsen. */
  parcelSek: number;
  /** Högsta varuvärde hos återförsäljaren, exkl. moms och frakt, som får gå som varubrev. */
  letterMaxSek: number;
  /**
   * Flest skyltar i en order som får gå som varubrev. När det är satt avgör antalet, och
   * varuvärdet (`letterMaxSek`) gäller inte (beslut av ägaren 2026-11-20: varubrevet är förvalt
   * upp till det antal verkstaden anger). Utan det gäller varuvärdet, som förut.
   */
  letterMaxSigns?: number | null;
  /**
   * Frakten för varje extra leveransadress, när verkstaden delar upp en order som ska till flera
   * ställen (beslut av ägaren 2026-11-23: "fast pris per extra adress"). Hela kronor exkl. moms,
   * samma i alla led som övrig frakt. Saknas i modeller sparade före priset: läs med `extraDeliverySekOf`.
   */
  extraDeliverySek?: number;
}

export const NO_SHIPPING: ShippingRule = { letterSek: 0, parcelSek: 0, letterMaxSek: 0 };

/** Förvalet för en extra leveransadress, när prismodellen inte har något eget pris. */
const DEFAULT_EXTRA_DELIVERY_SEK = 75;

/** Frakten för en extra leveransadress, i hela kronor exkl. moms. */
export function extraDeliverySekOf(rule: Pick<ShippingRule, "extraDeliverySek"> | null | undefined): number {
  return rule?.extraDeliverySek ?? DEFAULT_EXTRA_DELIVERY_SEK;
}

/**
 * Gränsen i varuvärde som betyder att varubrevet gäller varje order: det högsta värde gränsen kan
 * ha i prismodellen. Verkstaden har ingen gräns för hur många skyltar ett varubrev rymmer
 * (besked från Mats via ägaren 2026-11-20).
 */
export const LETTER_ALWAYS_SEK = 100_000;

export type ShippingKind = "letter" | "parcel";

/**
 * Standardfraktens fraktsätt för en order: varubrev upp till gränsen, annars paket. Gränsen är
 * orderns antal skyltar när regeln har ett (`letterMaxSigns`), annars varuvärdet. `null` när
 * listan saknar frakt eller ordern är tom.
 */
export function shippingKind(goodsSek: number, table: Pick<PriceTable, "shipping">, quantity: number): ShippingKind | null {
  const rule = table.shipping;
  if (!rule || goodsSek <= 0 || (rule.letterSek === 0 && rule.parcelSek === 0)) return null;
  if (typeof rule.letterMaxSigns === "number") return quantity <= rule.letterMaxSigns ? "letter" : "parcel";
  return goodsSek <= rule.letterMaxSek ? "letter" : "parcel";
}

/**
 * Frakten för en order där återförsäljaren betalar `goodsSek` för varorna,
 * alltså skyltarna med påslaget upp till minsta ordervärde men utan frakt.
 * Bara återförsäljarens lista har regeln. Kunden betalar samma frakt, och får
 * beloppet färdigt i stället för regeln (`priceOrder`).
 */
export function shippingSek(goodsSek: number, table: Pick<PriceTable, "shipping">, quantity: number): number {
  const kind = shippingKind(goodsSek, table, quantity);
  if (!kind || !table.shipping) return 0;
  return kind === "letter" ? table.shipping.letterSek : table.shipping.parcelSek;
}

/**
 * Vad paketet kostar när den som beställer kan välja det i stället för varubrevet (beslut av
 * ägaren 2026-11-20: varubrevet är förvalt, och kunden kan välja paket). `null` när
 * standardfrakten redan är paket, när paketet inte kostar mer, eller när listan saknar frakt.
 */
export function parcelChoiceSek(goodsSek: number, table: Pick<PriceTable, "shipping">, quantity: number): number | null {
  const rule = table.shipping;
  if (!rule || shippingKind(goodsSek, table, quantity) !== "letter") return null;
  return rule.parcelSek > rule.letterSek ? rule.parcelSek : null;
}

/**
 * Hur ordern lämnar verkstaden, samma val som i Skylt & Gravyrtekniks egen
 * kassa (beslut av ägaren 2026-11-15). `standard` följer fraktregeln: varubrev
 * eller paket. `parcel` är paket också för en order som annars hade gått som
 * varubrev (beslut av ägaren 2026-11-20). `pickup` hämtas hos verkstaden utan
 * frakt. `express` är PostNord Express, där verkstaden sätter priset efter
 * storlek och vikt innan ordern skickas, så ordern har ingen frakt när den läggs.
 */
export const SHIPPING_METHODS = ["standard", "parcel", "express", "pickup"] as const;
export type ShippingMethod = (typeof SHIPPING_METHODS)[number];

/**
 * Listan som gäller för ett fraktsätt. Standardfrakten följer fraktregeln, paketet har regeln
 * utan varubrev, och express och upphämtning har ingen regel alls.
 */
export function withShippingMethod(table: PriceTable, method: ShippingMethod): PriceTable {
  if (method === "standard" || !table.shipping) return table;
  if (method === "parcel") return { ...table, shipping: { ...table.shipping, letterMaxSek: 0, letterMaxSigns: 0 } };
  const rest = { ...table };
  delete rest.shipping;
  return rest;
}

/**
 * En parts prislista: vad den betalar per skylt på varje trappsteg, för
 * tillvalen, i startkostnad, i frakt och som minst för en order. Innehåller
 * ingenting om de andra parterna, så den kan skickas till den partens webbläsare.
 */
export interface PriceTable {
  /** Trappstegens gränser, stigande: steget gäller när ordern har fler skyltar än så. Första är 0. */
  tiers: number[];
  signs: Record<SignClass, number[]>;
  options: PriceOptions;
  /** Startkostnaden för en order. Den fördelas på orderns skyltar och ingår i priset per skylt. */
  startSek: number;
  minOrderSek: number;
  /**
   * Fraktregeln. Den finns bara i återförsäljarens lista, eftersom frakten räknas
   * på det återförsäljaren betalar för varorna. Slutkundens lista saknar den.
   */
  shipping?: ShippingRule;
  /**
   * Listan räknas med ören. Återförsäljarens lista gör det: priserna får ha
   * ören, och startkostnaden per skylt avrundas till ören. Slutkundens lista
   * räknas i hela kronor.
   */
  ore?: boolean;
}

/** Det som avgör en skylts pris. Kalkylen i admin räknar på samma underlag som en order. */
export interface PriceItem {
  signClass: SignClass;
  /** `null` är en skylt utan fäste. Det går bara att välja i adminens kalkyl; en skylt som beställs har alltid ett fäste. */
  mounting: MountingId | null;
  extraEngraving: boolean;
  /** Skylten skärs i en egen form. */
  customShape: boolean;
  /** Märkningsmetoden. Utan den räknas ingen märkning in, som för rader från före valet fanns. */
  marking?: MarkingMethod;
  /** Skylten har en ram, enkel eller dubbel. */
  frame?: boolean;
  quantity: number;
}

/** Säkerhetsnålen säljs inte längre; en äldre skylt med den prissätts som nål. */
const MOUNTING_OPTION: Record<MountingId, PriceOptionId> = {
  pin: "pin",
  clip: "clip",
  magnet: "magnet",
  "safety-pin": "pin",
};

/** Prisraden för varje märkningsmetod. */
export const MARKING_OPTION: Record<MarkingMethod, PriceOptionId> = {
  engrave: "markingEngrave",
  print: "markingPrint",
  "engrave-name-print-logo": "markingEngraveNamePrintLogo",
  "print-name-engrave-logo": "markingPrintNameEngraveLogo",
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
    marking: markingOf(doc),
    // Fältet finns bara med en ram, så att en skylt utan ram räknas och jämförs som förut.
    ...(doc.frame.style !== "none" && { frame: true }),
    quantity: doc.quantity,
  };
}

/** Det som avgör skyltarnas pris, utan design och text. Det är allt servern behöver för att räkna orderns frakt. */
export function priceItemsOf(docs: readonly BadgeDocument[]): PriceItem[] {
  return docs.map(priceItemOf);
}

function quantityOf(item: Pick<PriceItem, "quantity">): number {
  return Math.max(1, Math.floor(item.quantity));
}

/** Trappsteget för orderns totala antal — 30 olika namn räknas som 30 skyltar. */
export function tierIndexFor(quantity: number, table: PriceTable): number {
  return table.tiers.reduce((index, moreThan, i) => (quantity > moreThan ? i : index), 0);
}

/**
 * Trappsteget med flest skyltar, 501 eller fler i kalkylen. Där är priset
 * lägst, och det är priset väljarna visar som "Pris från" (beslut av ägaren
 * 2026-11-17).
 */
export function lastTierIndex(table: PriceTable): number {
  return Math.max(0, table.tiers.length - 1);
}

/** Priset för ett tillbehör eller tillval på ett trappsteg — det som läggs på skyltpriset. */
export function optionPriceSek(option: PriceOptionId, table: PriceTable, tierIndex = 0): number {
  // En lista härledd ur en äldre modell kan sakna en rad som kommit till senare; den kostar då ingenting.
  return table.options[option]?.[tierIndex] ?? 0;
}

/** Priset för en märkningsmetod på ett trappsteg. Noll betyder att metoden ingår i skylten. */
export function markingPriceSek(method: MarkingMethod, table: PriceTable, tierIndex = 0): number {
  return optionPriceSek(MARKING_OPTION[method], table, tierIndex);
}

/** Priset för ett fäste på ett trappsteg. */
export function mountingPriceSek(mounting: MountingId, table: PriceTable, tierIndex = 0): number {
  return optionPriceSek(MOUNTING_OPTION[mounting], table, tierIndex);
}

/**
 * Startkostnaden per skylt: orderns startkostnad delad på antalet skyltar.
 * 200 kr på 4 skyltar är 50 kr per skylt. Slutkundens del avrundas till hela
 * kronor, så summan kan skilja några kronor från startkostnaden och blir noll
 * på riktigt stora ordrar. Återförsäljarens del avrundas till ören.
 */
export function startShareSek(quantity: number, table: PriceTable): number {
  if (quantity <= 0) return 0;
  const share = table.startSek / quantity;
  return table.ore ? toOre(share) : Math.round(share);
}

/** Samma lista utan startkostnad — för att visa ett listpris per skylt, oberoende av orderns antal. */
export function withoutStartCost(table: PriceTable): PriceTable {
  return { ...table, startSek: 0 };
}

/** En del av skyltens pris: själva skylten, fästet, ett tillval, märkningsmetoden eller skyltens del av startkostnaden. */
export type PricePart = "sign" | "mounting" | "extraEngraving" | "customShape" | "marking" | "frame" | "start";

export interface UnitPricePart {
  part: PricePart;
  sek: number;
}

/** Skylten med fäste och tillval på ett trappsteg, före startkostnaden. */
function listPriceParts(item: PriceItem, tierIndex: number, table: PriceTable): UnitPricePart[] {
  const parts: UnitPricePart[] = [{ part: "sign", sek: table.signs[item.signClass][tierIndex] ?? 0 }];
  if (item.mounting) parts.push({ part: "mounting", sek: mountingPriceSek(item.mounting, table, tierIndex) });
  // Loggan ingår i skylten när dess pris är 0 kr (ägarens besked 2026-11-16), och har då ingen egen del.
  const logoSek = item.extraEngraving ? optionPriceSek("extraEngraving", table, tierIndex) : 0;
  if (logoSek > 0) parts.push({ part: "extraEngraving", sek: logoSek });
  if (item.customShape) parts.push({ part: "customShape", sek: optionPriceSek("customShape", table, tierIndex) });
  // En metod som ingår i skylten har ingen egen del; bara en metod med pris läggs på.
  const markingSek = item.marking ? markingPriceSek(item.marking, table, tierIndex) : 0;
  if (markingSek > 0) parts.push({ part: "marking", sek: markingSek });
  // Ramen kostar extra (beslut av ägaren 2026-11-20). En modell från före dess saknar raden: då ingår ramen.
  const frameSek = item.frame ? optionPriceSek("frame", table, tierIndex) : 0;
  if (frameSek > 0) parts.push({ part: "frame", sek: frameSek });
  return parts;
}

/**
 * Vad som ingår i en skylts à-pris när ordern har `orderQuantity` skyltar:
 * skylten, fästet, tillvalen och skyltens del av startkostnaden. Summan är
 * exakt à-priset i `priceItems`.
 */
export function unitPriceParts(item: PriceItem, orderQuantity: number, table: PriceTable): UnitPricePart[] {
  const parts = listPriceParts(item, tierIndexFor(orderQuantity, table), table);
  return table.startSek > 0 ? [...parts, { part: "start", sek: startShareSek(orderQuantity, table) }] : parts;
}

/** Samma uppdelning för en skylt i en order med `orderQuantity` skyltar. */
export function badgePriceParts(doc: BadgeDocument, orderQuantity: number, list: PriceTable): UnitPricePart[] {
  return unitPriceParts(priceItemOf(doc), orderQuantity, list);
}

/** Delarna som kunden ser. Startkostnaden står aldrig på en egen rad. */
export type ShownPricePart = Exclude<PricePart, "start">;

/**
 * Delarna så som kunden ser dem: skyltens del av startkostnaden ligger på
 * själva skylten och får ingen egen rad (besked via ägaren 2026-11-15).
 * Summan är densamma. Uppdelningen med startkostnaden för sig visas bara i
 * adminens prismodell.
 */
export function withStartInSign(parts: readonly UnitPricePart[]): { part: ShownPricePart; sek: number }[] {
  const start = parts.reduce((total, item) => (item.part === "start" ? total + item.sek : total), 0);
  return parts.flatMap((item) =>
    item.part === "start" ? [] : [{ part: item.part, sek: item.part === "sign" ? toOre(item.sek + start) : item.sek }],
  );
}

const sumOf = (parts: readonly UnitPricePart[]) => toOre(parts.reduce((total, part) => total + part.sek, 0));

export interface TablePrice {
  /** À-pris per rad, med startkostnaden per skylt inräknad. */
  unitSek: number[];
  quantity: number;
  tierIndex: number;
  /** Startkostnaden per skylt som ingår i varje à-pris. */
  startShareSek: number;
  badgesSek: number;
  /** Påslaget upp till minsta ordervärde; 0 när ordern redan når dit. */
  minimumTopUpSek: number;
  /** Varuvärdet: skyltarna med påslaget upp till minsta ordervärde, utan frakt. Provisionen räknas på det. */
  goodsSek: number;
  /** Frakten enligt listans fraktregel. 0 kr för slutkundens lista, som saknar regeln. */
  shippingSek: number;
  /** Paketets pris när den som beställer kan välja paket i stället för varubrevet, annars `null`. */
  parcelChoiceSek: number | null;
  /** Varuvärdet plus frakten. */
  totalSek: number;
}

/**
 * Ordern enligt en prislista. Hela ordern prissätts tillsammans: trappsteget
 * och startkostnaden gäller orderns totala antal, så 30 olika namn får samma
 * pris som 30 likadana.
 */
export function priceItems(items: readonly PriceItem[], table: PriceTable): TablePrice {
  const quantity = items.reduce((total, item) => total + quantityOf(item), 0);
  const tierIndex = tierIndexFor(quantity, table);
  const startShare = startShareSek(quantity, table);
  const unitSek = items.map((item) => sumOf(unitPriceParts(item, quantity, table)));
  const badgesSek = toOre(items.reduce((total, item, i) => total + (unitSek[i] ?? 0) * quantityOf(item), 0));
  const minimumTopUpSek = quantity > 0 ? toOre(Math.max(0, table.minOrderSek - badgesSek)) : 0;
  const goodsSek = toOre(badgesSek + minimumTopUpSek);
  const shipping = shippingSek(goodsSek, table, quantity);
  return {
    unitSek,
    quantity,
    tierIndex,
    startShareSek: startShare,
    badgesSek,
    minimumTopUpSek,
    goodsSek,
    shippingSek: shipping,
    parcelChoiceSek: parcelChoiceSek(goodsSek, table, quantity),
    totalSek: toOre(goodsSek + shipping),
  };
}

export interface PriceBreakdown {
  /** Snittpris per skylt med startkostnaden inräknad, före påslaget upp till minsta ordervärde. */
  unitSek: number;
  quantity: number;
  tierIndex: number;
  /** Startkostnaden per skylt som ingår i priset. */
  startShareSek: number;
  badgesSek: number;
  /** Påslaget upp till minsta ordervärde; 0 när ordern redan når dit. */
  minimumTopUpSek: number;
  /** Frakten för ordern. */
  shippingSek: number;
  /** Skyltarna, påslaget och frakten. */
  totalSek: number;
  totalInclVatSek: number;
}

/**
 * Kundens pris för ordern enligt slutkundens lista. `shippingSek` är orderns
 * frakt, som är samma i alla led och räknas på det återförsäljaren betalar:
 * på servern med `orderShippingSek`, hos en inloggad återförsäljare ur dess
 * inköpslista. Kundens webbläsare frågar servern (`useOrderShipping`).
 */
export function priceOrder(docs: readonly BadgeDocument[], list: PriceTable, shippingSek: number): PriceBreakdown {
  const price = priceItems(docs.map(priceItemOf), list);
  const totalSek = price.goodsSek + shippingSek;
  return {
    unitSek: price.quantity > 0 ? Math.round(price.badgesSek / price.quantity) : 0,
    quantity: price.quantity,
    tierIndex: price.tierIndex,
    startShareSek: price.startShareSek,
    badgesSek: price.badgesSek,
    minimumTopUpSek: price.minimumTopUpSek,
    shippingSek,
    totalSek,
    totalInclVatSek: Math.round(totalSek * (1 + VAT_RATE)),
  };
}

/** Kundens à-pris per skylt i ordern, med startkostnaden per skylt inräknad. */
export function lineUnitPrices(docs: readonly BadgeDocument[], list: PriceTable): number[] {
  return priceItems(docs.map(priceItemOf), list).unitSek;
}

/** Priset för en ensam skylt, utan frakt. Används för exempelpriser, där ingen order finns. */
export function priceBadge(doc: BadgeDocument, list: PriceTable): PriceBreakdown {
  return priceOrder([doc], list, 0);
}

/** Vad återförsäljaren betalar för skyltarna, enligt återförsäljarens lista. */
export function resellerOrder(docs: readonly BadgeDocument[], purchaseList: PriceTable): TablePrice {
  return priceItems(docs.map(priceItemOf), purchaseList);
}

/**
 * Lägsta listpris för en skylt i materialet på ett trappsteg: skylten med det
 * billigaste fästet som säljs. Startkostnaden är inte med, eftersom den beror
 * på orderns antal.
 */
export function fromPriceSek(materialId: MaterialId, list: PriceTable, tierIndex = 0): number {
  const cheapestMounting = Math.min(...MOUNTINGS.filter((m) => m.offered).map((m) => mountingPriceSek(m.id, list, tierIndex)));
  return (list.signs[signClassOf(materialId)][tierIndex] ?? 0) + cheapestMounting;
}

/** Trappstegets antal som text: `1–100 st`, `501 st eller fler`. */
export function tierRangeLabel(tierIndex: number, table: PriceTable): string {
  const from = (table.tiers[tierIndex] ?? 0) + 1;
  const next = table.tiers[tierIndex + 1];
  return next === undefined ? `${from} st eller fler` : `${from}–${next} st`;
}
