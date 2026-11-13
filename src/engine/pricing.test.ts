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
  tierIndexFor,
  tierRangeLabel,
  type PriceItem,
} from "./pricing";
import {
  endPriceSek,
  endPriceTable,
  priceModelSchema,
  provisionSplit,
  resellerPriceTable,
  type PriceModel,
} from "./price-model";
import type { BadgeDocument } from "./types";

const M = DEFAULT_PRICE_MODEL;
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
    const bare = resellerPriceTable({ ...M, options: { ...M.options, pin: 0 }, minOrderSek: 0 });
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

describe("prislistorna håller isär parterna", () => {
  it("slutkundens lista innehåller varken inköpspriser, provision eller marginal", () => {
    const text = JSON.stringify(LIST);
    assert.deepEqual(Object.keys(LIST).sort(), ["minOrderSek", "options", "signs", "tiers"]);
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
