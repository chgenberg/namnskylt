import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createBadgeDocument, lineUnitPrices, NO_SHIPPING, priceOrder } from "@/engine";
import { endPriceTable } from "@/engine/price-model";
import { DEFAULT_PRICE_MODEL } from "@/engine/default-price-model";
import { shopOrderPricing, shopPrice, shopPriceListSchema, shopPriceParts, shopUnitPrices } from "./price-list";

/** Kundens prislista enligt kalkylen, utan startkostnad: den har egna tester i motorn. */
const M = endPriceTable({ ...DEFAULT_PRICE_MODEL, startSek: 0, shipping: NO_SHIPPING });
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
    const withStart = endPriceTable(DEFAULT_PRICE_MODEL);
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
