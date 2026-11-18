import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createBadgeDocument, lineUnitPrices, NO_SHIPPING, priceOrder } from "@/engine";
import { endPriceTable } from "@/engine/price-model";
import { DEFAULT_PRICE_MODEL } from "@/engine/default-price-model";
import { designSums, shopOrderPricing, shopPrice, shopPriceListSchema, shopPriceParts, shopUnitPrices } from "./price-list";

/**
 * Kalkylen med ett eget pris på loggan, som den var före 2026-11-16. Sedan dess ingår loggan
 * (priset är 0 kr), men räknereglerna för en prissatt logga gäller om ägaren sätter ett pris igen.
 */
const KALKYL: typeof DEFAULT_PRICE_MODEL = {
  ...DEFAULT_PRICE_MODEL,
  options: { ...DEFAULT_PRICE_MODEL.options, extraEngraving: [19, 19, 19, 19] },
};

/** Kundens prislista enligt kalkylen, utan startkostnad: den har egna tester i motorn. */
const M = endPriceTable({ ...KALKYL, startSek: 0, shipping: NO_SHIPPING });
const metal = { ...createBadgeDocument(["Anna Berg", "Receptionist"]), quantity: 24 };
const plastic = { ...createBadgeDocument(["Erik"]), materialId: "plastic-2-layer" as const, colorId: "white-black", quantity: 1 };

describe("butikens prislista", () => {
  it("utan prislista är priset riktpriset", () => {
    assert.deepEqual(shopUnitPrices([metal], null, M), lineUnitPrices([metal], M));
    assert.equal(shopPrice([metal], null, M, 0).totalSek, priceOrder([metal], M, 0).totalSek);
    assert.equal(shopOrderPricing([metal], null, M), null);
    assert.equal(shopOrderPricing([metal], { percent: 0, perMaterial: {} }, M), null);
  });

  it("lägger påslaget efter trappstegets pris, per material när det finns", () => {
    const list = { percent: 20, perMaterial: { "plastic-2-layer": -10 } };
    const [metalList = 0, plasticList = 0] = lineUnitPrices([metal, plastic], M);
    assert.deepEqual(shopUnitPrices([metal, plastic], list, M), [Math.round(metalList * 1.2), Math.round(plasticList * 0.9)]);
  });

  it("ordern sparas med exakt de priser kunden såg", () => {
    const list = { percent: 35, perMaterial: {} };
    const shown = shopPrice([metal], list, M, 0);
    const pricing = shopOrderPricing([metal], list, M);
    assert.ok(pricing);
    assert.equal((pricing.unitOverrides[0] ?? 0) * metal.quantity, shown.totalSek);
  });

  it("specifikationen per skylt summerar till butikens à-pris, med och utan påslag", () => {
    const withStart = endPriceTable(KALKYL);
    const logo = { d: "M0 0h1v1z", viewWidth: 1, viewHeight: 1, placement: "top" as const, heightMm: 10 };
    for (const percent of [0, 7, 20, 35, -15]) {
      for (const quantity of [1, 6, 24, 101, 350]) {
        const badge = { ...metal, mounting: "magnet" as const, logo, quantity };
        const list = { percent, perMaterial: {} };
        const parts = shopPriceParts(badge, quantity, list, withStart);
        const sum = parts.reduce((total, part) => total + part.sek, 0);
        assert.equal(sum, shopUnitPrices([badge], list, withStart)[0], `${percent} %, ${quantity} st`);
        assert.deepEqual(
          parts.map((part) => part.part),
          ["sign", "mounting", "extraEngraving", "start"],
        );
      }
    }
    assert.deepEqual(shopPriceParts(metal, 24, null, M), [
      { part: "sign", sek: 122 },
      { part: "mounting", sek: 8 },
    ]);
  });

  it("en liten order i butiken fylls upp till minsta ordervärde", () => {
    const one = [{ ...metal, quantity: 1 }];
    const shown = shopPrice(one, { percent: 10, perMaterial: {} }, M, 0);
    assert.equal(shown.totalSek, M.minOrderSek);
    assert.equal(shown.minimumTopUpSek, M.minOrderSek - shown.badgesSek);
  });

  it("validerar procent och material", () => {
    assert.equal(shopPriceListSchema.safeParse({ percent: 400, perMaterial: {} }).success, false);
    assert.equal(shopPriceListSchema.safeParse({ percent: 10, perMaterial: { guld: 5 } }).success, false);
    assert.equal(shopPriceListSchema.safeParse({ percent: 10, perMaterial: { brass: 5 } }).success, true);
  });
});

describe("varje design som en egen rad i ordern", () => {
  /** Kalkylen med startkostnad, som kunden möter den. */
  const LIST = endPriceTable({ ...DEFAULT_PRICE_MODEL, shipping: NO_SHIPPING });
  const anna = { ...createBadgeDocument(["Anna Berg", "Receptionist"]), quantity: 1 };
  const erik = { ...createBadgeDocument(["Erik Holm"]), quantity: 1 };
  const big = { ...createBadgeDocument(["Maja Lind"]), materialId: "plastic" as const, colorId: "white-black", quantity: 107 };
  const small = { ...createBadgeDocument(["Omar Said"]), quantity: 10 };

  it("ger varje design sitt antal och sin summa, och summorna är orderns varuvärde", () => {
    const sums = designSums([[big], [small]], null, LIST);
    assert.deepEqual(sums.map((sum) => sum.quantity), [107, 10]);
    const order = priceOrder([big, small], LIST, 0);
    assert.equal(sums[0]!.sek + sums[1]!.sek, order.badgesSek);
    assert.equal(order.minimumTopUpSek, 0);
  });

  it("priset per skylt är orderns: en design blir billigare av att en annan ligger i samma order", () => {
    const [together] = designSums([[small], [big]], null, LIST);
    const [alone] = designSums([[small]], null, LIST);
    assert.ok(together && alone && together.sek < alone.sek);
    assert.equal(together.quantity, 10);
  });

  it("en design med flera namn räknas ihop, och butikens påslag följer med", () => {
    const [team, single] = designSums([[anna, { ...erik, quantity: 3 }], [small]], null, LIST);
    assert.equal(team?.quantity, 4);
    const units = shopUnitPrices([anna, { ...erik, quantity: 3 }, small], null, LIST);
    assert.equal(team?.sek, units[0]! + units[1]! * 3);
    assert.equal(single?.sek, units[2]! * 10);
    const marked = designSums([[small]], { percent: 20, perMaterial: {} }, LIST)[0];
    assert.ok(marked && marked.sek > designSums([[small]], null, LIST)[0]!.sek);
  });

  it("en tom varukorg ger inga rader", () => {
    assert.deepEqual(designSums([], null, LIST), []);
  });
});
