import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createBadgeDocument, withBlank, withShapePreset } from "./document";
import { BLANKS } from "./catalog";
import { DEFAULT_PRICE_MODEL } from "./default-price-model";
import {
  fromPriceSek,
  lineUnitPrices,
  mountingPriceSek,
  priceItems,
  priceOrder,
  resellerOrder,
  startShareSek,
  tierIndexFor,
  tierRangeLabel,
  withoutStartCost,
  type PriceItem,
} from "./pricing";
import {
  endPriceSek,
  endPriceTable,
  parseStoredPriceModel,
  priceModelSchema,
  provisionSplit,
  resellerPriceTable,
  type PriceModel,
} from "./price-model";
import type { BadgeDocument } from "./types";

/** Kalkylens siffror utan startkostnad: reglerna här prövas var för sig, och startkostnaden har egna tester. */
const M: PriceModel = { ...DEFAULT_PRICE_MODEL, startSek: 0 };
/** Det återförsäljaren betalar. */
const PURCHASE = resellerPriceTable(M);
/** Det slutkunden betalar. */
const LIST = endPriceTable(M);

const premium = (quantity: number, patch: Partial<PriceItem> = {}): PriceItem => ({
  signClass: "premium",
  mounting: "pin",
  extraEngraving: false,
  customShape: false,
  quantity,
  ...patch,
});

describe("kalkylens siffror", () => {
  it("har fyra trappsteg: 1–100, 101–300, 301–500 och 501 eller fler", () => {
    assert.deepEqual(
      [1, 100, 101, 300, 301, 500, 501, 5000].map((q) => tierIndexFor(q, PURCHASE)),
      [0, 0, 1, 1, 2, 2, 3, 3],
    );
    assert.deepEqual(
      PURCHASE.tiers.map((_, i) => tierRangeLabel(i, PURCHASE)),
      ["1–100 st", "101–300 st", "301–500 st", "501 st eller fler"],
    );
  });

  it("återförsäljaren betalar tabellens pris: Premium 73, 68, 64 och 61 kr, Standard 54, 50, 47 och 43 kr", () => {
    const bare = resellerPriceTable({ ...M, options: { ...M.options, pin: [0, 0, 0, 0] }, minOrderSek: 0 });
    for (const [signClass, expected] of [
      ["premium", [73, 68, 64, 61]],
      ["standard", [54, 50, 47, 43]],
    ] as const) {
      const units = [100, 101, 301, 501].map((quantity) => priceItems([premium(quantity, { signClass })], bare).unitSek[0]);
      assert.deepEqual(units, expected, signClass);
    }
  });

  it("provisionen är plattformens andel och resten går till verkstaden: 73 kr blir 11 och 62", () => {
    assert.deepEqual(provisionSplit(M, 73, 1), { provisionPercent: 15, provisionSek: 11, supplierSek: 62 });
    assert.deepEqual(
      [101, 301, 501].map((quantity) => provisionSplit(M, 1000, quantity).provisionPercent),
      [12, 10, 8],
    );
  });

  it("tillvalen läggs på skylten: nål 5, klämma 9, magnet 11 och logga 19 kr", () => {
    const unit = (patch: Partial<PriceItem>) => priceItems([premium(200, patch)], PURCHASE).unitSek[0];
    assert.equal(unit({}), 68 + 5);
    assert.equal(unit({ mounting: "clip" }), 68 + 9);
    assert.equal(unit({ mounting: "magnet" }), 68 + 11);
    assert.equal(unit({ mounting: "magnet", extraEngraving: true }), 68 + 11 + 19);
  });

  it("egen form kostar 19 kr extra per skylt, och slutkunden betalar 32 kr", () => {
    const plain = priceItems([premium(200, { signClass: "standard" })], PURCHASE).unitSek[0];
    const custom = priceItems([premium(200, { signClass: "standard", customShape: true })], PURCHASE).unitSek[0];
    assert.equal(plain, 50 + 5);
    assert.equal(custom, 50 + 5 + 19);
    const doc = { ...withShapePreset({ ...createBadgeDocument(["Anna"]), materialId: "plastic" as const, colorId: "white-black" }, "star"), quantity: 10 };
    assert.equal(priceOrder([doc], LIST).unitSek, endPriceSek(54, M) + 8 + 32);
  });

  it("en äldre skylt med säkerhetsnål prissätts som nål", () => {
    assert.equal(priceItems([premium(200, { mounting: "safety-pin" })], PURCHASE).unitSek[0], 68 + 5);
  });
});

describe("minidebiteringen", () => {
  it("återförsäljaren betalar minst 299 kr, och provisionen räknas på hela beloppet", () => {
    const order = priceItems([premium(1)], PURCHASE);
    assert.equal(order.badgesSek, 78);
    assert.equal(order.minimumTopUpSek, 221);
    assert.equal(order.totalSek, 299);
    assert.deepEqual(provisionSplit(M, order.totalSek, order.quantity), { provisionPercent: 15, provisionSek: 45, supplierSek: 254 });
  });

  it("en order över gränsen får inget påslag", () => {
    const order = priceItems([premium(4)], PURCHASE);
    assert.equal(order.totalSek, 4 * 78);
    assert.equal(order.minimumTopUpSek, 0);
  });
});

describe("slutkundens pris", () => {
  it("räknas med marginal, inte påslag: 73 kr och 40 % blir 122 kr", () => {
    assert.equal(endPriceSek(73, M), 122);
    assert.equal(endPriceSek(73, { ...M, endMarginPercent: 0 }), 73);
    assert.equal(endPriceSek(60, { ...M, endMarginPercent: 50 }), 120);
    assert.deepEqual(LIST.signs.premium, [122, 113, 107, 102]);
  });

  it("delarna avrundas var för sig så att skylt, fäste och logga summerar till priset", () => {
    const [unit] = lineUnitPrices([{ ...createBadgeDocument(["Anna"]), mounting: "magnet" }], LIST);
    assert.equal(unit, 122 + mountingPriceSek("magnet", LIST));
    assert.equal(mountingPriceSek("pin", LIST), 8);
    assert.equal(mountingPriceSek("clip", LIST), 15);
    assert.equal(mountingPriceSek("magnet", LIST), 18);
  });

  it("från-priset är skylten med det billigaste fästet, och det är vad en skylt kostar", () => {
    assert.equal(fromPriceSek("metal", LIST), 130);
    assert.equal(fromPriceSek("plastic", LIST), 90 + 8);
    assert.equal(priceOrder([{ ...createBadgeDocument(["Anna"]), quantity: 10 }], LIST).unitSek, 130);
    assert.equal(fromPriceSek("metal", LIST, 3), 102 + 8);
  });

  it("alla fyra ämnen kostar lika", () => {
    for (const blank of BLANKS) {
      const doc = { ...withBlank(createBadgeDocument(["Anna"]), blank.id), quantity: 10 };
      assert.equal(priceOrder([doc], LIST).unitSek, 130, blank.id);
    }
  });

  it("minsta ordervärde är 299 kr: en ensam skylt kostar 299, inte 130", () => {
    const one = priceOrder([createBadgeDocument(["Anna"])], LIST);
    assert.equal(one.badgesSek, 130);
    assert.equal(one.minimumTopUpSek, 169);
    assert.equal(one.totalSek, 299);
    assert.equal(one.totalInclVatSek, 374);
    assert.equal(priceOrder([{ ...createBadgeDocument(["Anna"]), quantity: 3 }], LIST).minimumTopUpSek, 0);
  });

  it("trappsteget gäller orderns totala antal, även när alla skyltar har olika namn", () => {
    const names: BadgeDocument[] = Array.from({ length: 101 }, (_, i) => createBadgeDocument([`Person ${i}`]));
    const order = priceOrder(names, LIST);
    assert.equal(order.quantity, 101);
    assert.equal(order.tierIndex, 1);
    assert.equal(order.unitSek, 113 + 8);
    assert.equal(resellerOrder(names, PURCHASE).unitSek[0], 68 + 5);
  });
});

describe("startkostnaden", () => {
  const D = DEFAULT_PRICE_MODEL;
  const purchase = resellerPriceTable(D);
  const list = endPriceTable(D);
  const anna = (quantity: number): BadgeDocument => ({ ...createBadgeDocument(["Anna"]), quantity });

  it("delas på antalet skyltar: 200 kr på 4 skyltar lägger 50 kr på varje", () => {
    assert.equal(D.startSek, 200);
    const order = priceItems([premium(4)], purchase);
    assert.equal(order.startShareSek, 50);
    assert.deepEqual(order.unitSek, [78 + 50]);
    assert.equal(order.totalSek, 4 * 128);
    assert.equal(order.minimumTopUpSek, 0);
  });

  it("slutkunden betalar den med samma marginal som priset per skylt: 333 kr, 83 kr per skylt på 4 skyltar", () => {
    assert.equal(list.startSek, 333);
    const order = priceOrder([anna(4)], list);
    assert.equal(order.startShareSek, 83);
    assert.equal(order.unitSek, 130 + 83);
    assert.equal(order.totalSek, 4 * 213);
  });

  it("gäller orderns totala antal, även när alla skyltar har olika namn", () => {
    const names = Array.from({ length: 4 }, (_, i) => createBadgeDocument([`Person ${i}`]));
    assert.deepEqual(resellerOrder(names, purchase).unitSek, [128, 128, 128, 128]);
    assert.deepEqual(lineUnitPrices(names, list), [213, 213, 213, 213]);
  });

  it("avrundas till hela kronor per skylt: 3 skyltar ger 67 kr, 100 ger 2 kr och över 400 skyltar blir den 0", () => {
    assert.deepEqual(
      [1, 3, 7, 100, 150, 401].map((quantity) => startShareSek(quantity, purchase)),
      [200, 67, 29, 2, 1, 0],
    );
    assert.equal(startShareSek(0, purchase), 0);
  });

  it("en ensam skylt bär hela startkostnaden, och minidebiteringen fyller bara upp resten", () => {
    const reseller = priceItems([premium(1)], purchase);
    assert.equal(reseller.badgesSek, 78 + 200);
    assert.equal(reseller.minimumTopUpSek, 21);
    assert.equal(reseller.totalSek, 299);
    const customer = priceOrder([anna(1)], list);
    assert.equal(customer.badgesSek, 130 + 333);
    assert.equal(customer.minimumTopUpSek, 0);
  });

  it("provisionen gäller startkostnaden som allt annat: 512 kr ger 77 kr", () => {
    const order = priceItems([premium(4)], purchase);
    assert.deepEqual(provisionSplit(D, order.totalSek, order.quantity), { provisionPercent: 15, provisionSek: 77, supplierSek: 435 });
  });

  it("från-priset och ett listpris utan startkostnad påverkas inte", () => {
    assert.equal(fromPriceSek("metal", list), 130);
    assert.equal(priceOrder([anna(10)], withoutStartCost(list)).unitSek, 130);
    assert.equal(withoutStartCost(list).minOrderSek, list.minOrderSek);
  });
});

describe("tillbehör och tillval per trappsteg", () => {
  const tiered: PriceModel = { ...M, options: { ...M.options, pin: [5, 4, 3, 2], extraEngraving: [19, 17, 15, 13] } };
  const purchase = resellerPriceTable(tiered);
  const list = endPriceTable(tiered);

  it("fästet och tillvalet följer orderns trappsteg", () => {
    const units = [100, 101, 301, 501].map((quantity) => priceItems([premium(quantity, { extraEngraving: true })], purchase).unitSek[0]);
    assert.deepEqual(units, [73 + 5 + 19, 68 + 4 + 17, 64 + 3 + 15, 61 + 2 + 13]);
    assert.deepEqual([0, 1, 2, 3].map((tier) => mountingPriceSek("pin", purchase, tier)), [5, 4, 3, 2]);
  });

  it("slutkundens pris räknas med marginalen på varje trappsteg", () => {
    assert.deepEqual(list.options.pin, [8, 7, 5, 3]);
    assert.deepEqual(list.options.extraEngraving, [32, 28, 25, 22]);
  });

  it("från-priset tar trappstegets billigaste fäste", () => {
    assert.equal(fromPriceSek("metal", list, 0), 122 + 8);
    assert.equal(fromPriceSek("metal", list, 3), 102 + 3);
  });

  it("modellen kräver ett pris per trappsteg", () => {
    assert.equal(priceModelSchema.safeParse(tiered).success, true);
    assert.equal(priceModelSchema.safeParse({ ...tiered, options: { ...tiered.options, pin: [5, 4, 3] } }).success, false);
    assert.equal(priceModelSchema.safeParse({ ...tiered, options: { ...tiered.options, pin: 5 } }).success, false);
    assert.equal(priceModelSchema.safeParse({ ...tiered, startSek: -1 }).success, false);
  });
});

describe("en modell sparad i det äldre formatet", () => {
  /** Som modellen sparades på ordrar och offerter före startkostnaden. */
  const older = {
    tiers: M.tiers,
    signs: M.signs,
    options: { customShape: 19, extraEngraving: 19, pin: 5, clip: 9, magnet: 11 },
    minOrderSek: 299,
    endMarginPercent: 40,
    endMinOrderSek: 299,
  };

  it("läses som samma pris på alla trappsteg och ingen startkostnad, så att priserna står kvar", () => {
    const model = parseStoredPriceModel(JSON.parse(JSON.stringify(older)));
    assert.deepEqual(model, M);
    assert.equal(model?.startSek, 0);
    assert.deepEqual(model?.options.pin, [5, 5, 5, 5]);
  });

  it("en modell i dagens format läses oförändrad", () => {
    assert.deepEqual(parseStoredPriceModel(JSON.parse(JSON.stringify(DEFAULT_PRICE_MODEL))), DEFAULT_PRICE_MODEL);
  });

  it("annat än en prismodell ger null", () => {
    for (const value of [null, undefined, "x", 7, [], {}, { ...older, tiers: [] }]) {
      assert.equal(parseStoredPriceModel(value), null);
    }
  });
});

describe("prislistorna håller isär parterna", () => {
  it("slutkundens lista innehåller varken inköpspriser, provision eller marginal", () => {
    const text = JSON.stringify(LIST);
    assert.deepEqual(Object.keys(LIST).sort(), ["minOrderSek", "options", "signs", "startSek", "tiers"]);
    assert.doesNotMatch(text, /provision|margin|reseller/i);
    // Inget av återförsäljarens skyltpriser står i kundens lista.
    for (const price of [...M.signs.premium, ...M.signs.standard]) {
      assert.ok(![...LIST.signs.premium, ...LIST.signs.standard].includes(price), `${price} kr läcker`);
    }
  });

  it("återförsäljarens lista innehåller sina inköpspriser men inte provisionen", () => {
    assert.deepEqual(PURCHASE.signs, M.signs);
    assert.equal(PURCHASE.minOrderSek, 299);
    assert.deepEqual(PURCHASE.tiers, [0, 100, 300, 500]);
    assert.doesNotMatch(JSON.stringify(PURCHASE), /provision|margin/i);
  });
});

describe("priceModelSchema", () => {
  it("godtar kalkylen och ett sparat utkast", () => {
    assert.equal(priceModelSchema.safeParse(M).success, true);
    assert.deepEqual(priceModelSchema.parse(JSON.parse(JSON.stringify(M))), M);
  });

  it("kräver stigande trappsteg som börjar på 0", () => {
    const tiers = (moreThan: number[]) => M.tiers.map((tier, i) => ({ ...tier, moreThan: moreThan[i] ?? 0 }));
    assert.equal(priceModelSchema.safeParse({ ...M, tiers: tiers([0, 100, 100, 500]) }).success, false);
    assert.equal(priceModelSchema.safeParse({ ...M, tiers: tiers([0, 300, 100, 500]) }).success, false);
    assert.equal(priceModelSchema.safeParse({ ...M, tiers: tiers([1, 100, 300, 500]) }).success, false);
    assert.equal(priceModelSchema.safeParse({ ...M, tiers: tiers([0, 50, 200, 1000]) }).success, true);
  });

  it("stoppar en marginal på 100 %, negativa belopp och ören", () => {
    const model: PriceModel = M;
    assert.equal(priceModelSchema.safeParse({ ...model, endMarginPercent: 100 }).success, false);
    assert.equal(priceModelSchema.safeParse({ ...model, minOrderSek: -1 }).success, false);
    assert.equal(priceModelSchema.safeParse({ ...model, signs: { ...model.signs, premium: [73.5, 68, 64, 61] } }).success, false);
    assert.equal(priceModelSchema.safeParse({ ...model, signs: { ...model.signs, premium: [73, 68, 64] } }).success, false);
  });
});
