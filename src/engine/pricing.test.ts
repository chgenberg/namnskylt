import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createBadgeDocument, withBlank, withShapePreset } from "./document";
import { BLANKS } from "./catalog";
import {
  DEFAULT_PRICE_MODEL,
  endPriceOf,
  endPriceSek,
  fromPriceSek,
  lineUnitPrices,
  mountingPriceSek,
  priceModelSchema,
  priceOrder,
  resellerOrder,
  resellerPriceOf,
  tierIndexFor,
  tierRangeLabel,
  type PriceItem,
  type PriceModel,
} from "./pricing";
import type { BadgeDocument } from "./types";

const M = DEFAULT_PRICE_MODEL;
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
      [1, 100, 101, 300, 301, 500, 501, 5000].map((q) => tierIndexFor(q, M)),
      [0, 0, 1, 1, 2, 2, 3, 3],
    );
    assert.deepEqual(
      M.tiers.map((_, i) => tierRangeLabel(i, M)),
      ["1–100 st", "101–300 st", "301–500 st", "501 st eller fler"],
    );
  });

  it("återförsäljaren betalar tabellens pris: Premium 73, 68, 64 och 61 kr, Standard 54, 50, 47 och 43 kr", () => {
    const noMounting: PriceModel = { ...M, options: { ...M.options, pin: 0 }, minOrderSek: 0 };
    for (const [signClass, expected] of [
      ["premium", [73, 68, 64, 61]],
      ["standard", [54, 50, 47, 43]],
    ] as const) {
      const units = [100, 101, 301, 501].map((quantity) => resellerPriceOf([premium(quantity, { signClass })], noMounting).unitSek[0]);
      assert.deepEqual(units, expected, signClass);
    }
  });

  it("provisionen är plattformens andel och resten går till verkstaden: 73 kr blir 11 och 62", () => {
    const one: PriceModel = { ...M, options: { ...M.options, pin: 0 }, minOrderSek: 0 };
    const order = resellerPriceOf([premium(1)], one);
    assert.equal(order.totalSek, 73);
    assert.equal(order.provisionPercent, 15);
    assert.equal(order.provisionSek, 11);
    assert.equal(order.supplierSek, 62);
    assert.deepEqual(
      [101, 301, 501].map((quantity) => resellerPriceOf([premium(quantity)], one).provisionPercent),
      [12, 10, 8],
    );
  });

  it("tillvalen läggs på skylten: nål 5, klämma 9, magnet 11 och logga 19 kr", () => {
    const unit = (patch: Partial<PriceItem>) => resellerPriceOf([premium(200, patch)], M).unitSek[0];
    assert.equal(unit({}), 68 + 5);
    assert.equal(unit({ mounting: "clip" }), 68 + 9);
    assert.equal(unit({ mounting: "magnet" }), 68 + 11);
    assert.equal(unit({ mounting: "magnet", extraEngraving: true }), 68 + 11 + 19);
  });

  it("egen form kostar 19 kr extra per skylt, och slutkunden betalar 32 kr", () => {
    const plain = resellerPriceOf([premium(200, { signClass: "standard" })], M).unitSek[0];
    const custom = resellerPriceOf([premium(200, { signClass: "standard", customShape: true })], M).unitSek[0];
    assert.equal(plain, 50 + 5);
    assert.equal(custom, 50 + 5 + 19);
    const doc = { ...withShapePreset({ ...createBadgeDocument(["Anna"]), materialId: "plastic" as const, colorId: "white-black" }, "star"), quantity: 10 };
    assert.equal(priceOrder([doc], M).unitSek, endPriceSek(54, M) + 8 + endPriceSek(19, M));
  });

  it("en äldre skylt med säkerhetsnål prissätts som nål", () => {
    assert.equal(resellerPriceOf([premium(200, { mounting: "safety-pin" })], M).unitSek[0], 68 + 5);
  });
});

describe("minidebiteringen", () => {
  it("återförsäljaren betalar minst 299 kr, och provisionen räknas på hela beloppet", () => {
    const order = resellerPriceOf([premium(1)], M);
    assert.equal(order.badgesSek, 78);
    assert.equal(order.minimumTopUpSek, 221);
    assert.equal(order.totalSek, 299);
    assert.equal(order.provisionSek, 45);
    assert.equal(order.supplierSek, 254);
  });

  it("en order över gränsen får inget påslag", () => {
    const order = resellerPriceOf([premium(4)], M);
    assert.equal(order.totalSek, 4 * 78);
    assert.equal(order.minimumTopUpSek, 0);
  });
});

describe("slutkundens pris", () => {
  it("räknas med marginal, inte påslag: 73 kr och 40 % blir 122 kr", () => {
    assert.equal(endPriceSek(73, M), 122);
    assert.equal(endPriceSek(73, { ...M, endMarginPercent: 0 }), 73);
    assert.equal(endPriceSek(60, { ...M, endMarginPercent: 50 }), 120);
  });

  it("delarna avrundas var för sig så att skylt, fäste och logga summerar till priset", () => {
    const [unit] = lineUnitPrices([{ ...createBadgeDocument(["Anna"]), mounting: "magnet" }], M);
    assert.equal(unit, endPriceSek(73, M) + mountingPriceSek("magnet", M));
    assert.equal(mountingPriceSek("pin", M), 8);
    assert.equal(mountingPriceSek("clip", M), 15);
    assert.equal(mountingPriceSek("magnet", M), 18);
  });

  it("från-priset är skylten med det billigaste fästet, och det är vad en skylt kostar", () => {
    assert.equal(fromPriceSek("metal", M), 130);
    assert.equal(priceOrder([{ ...createBadgeDocument(["Anna"]), quantity: 10 }], M).unitSek, 130);
    assert.equal(fromPriceSek("metal", M, 3), endPriceSek(61, M) + 8);
  });

  it("alla fyra ämnen kostar lika", () => {
    for (const blank of BLANKS) {
      const doc = { ...withBlank(createBadgeDocument(["Anna"]), blank.id), quantity: 10 };
      assert.equal(priceOrder([doc], M).unitSek, 130, blank.id);
    }
  });

  it("minsta ordervärde är 299 kr: en ensam skylt kostar 299, inte 130", () => {
    const one = endPriceOf([premium(1)], M);
    assert.equal(one.badgesSek, 130);
    assert.equal(one.minimumTopUpSek, 169);
    assert.equal(one.totalSek, 299);
    assert.equal(one.totalInclVatSek, 374);
    assert.equal(endPriceOf([premium(3)], M).minimumTopUpSek, 0);
  });

  it("trappsteget gäller orderns totala antal, även när alla skyltar har olika namn", () => {
    const names: BadgeDocument[] = Array.from({ length: 101 }, (_, i) => createBadgeDocument([`Person ${i}`]));
    const order = priceOrder(names, M);
    assert.equal(order.quantity, 101);
    assert.equal(order.tierIndex, 1);
    assert.equal(order.unitSek, endPriceSek(68, M) + 8);
    assert.equal(resellerOrder(names, M).unitSek[0], 68 + 5);
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
    assert.equal(priceModelSchema.safeParse({ ...M, endMarginPercent: 100 }).success, false);
    assert.equal(priceModelSchema.safeParse({ ...M, minOrderSek: -1 }).success, false);
    assert.equal(priceModelSchema.safeParse({ ...M, signs: { ...M.signs, premium: [73.5, 68, 64, 61] } }).success, false);
    assert.equal(priceModelSchema.safeParse({ ...M, signs: { ...M.signs, premium: [73, 68, 64] } }).success, false);
  });
});
