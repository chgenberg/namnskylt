import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createBadgeDocument, DEFAULT_PRICE_MODEL as M, lineUnitPrices, priceOrder } from "@/engine";
import { shopOrderPricing, shopPrice, shopPriceListSchema, shopUnitPrices } from "./price-list";

const metal = { ...createBadgeDocument(["Anna Berg", "Receptionist"]), quantity: 24 };
const plastic = { ...createBadgeDocument(["Erik"]), materialId: "plastic-2-layer" as const, colorId: "white-black", quantity: 1 };

describe("butikens prislista", () => {
  it("utan prislista är priset riktpriset", () => {
    assert.deepEqual(shopUnitPrices([metal], null, M), lineUnitPrices([metal], M));
    assert.equal(shopPrice([metal], null, M).totalSek, priceOrder([metal], M).totalSek);
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
    const shown = shopPrice([metal], list, M);
    const pricing = shopOrderPricing([metal], list, M);
    assert.ok(pricing);
    assert.equal((pricing.unitOverrides[0] ?? 0) * metal.quantity, shown.totalSek);
  });

  it("en liten order i butiken fylls upp till minsta ordervärde", () => {
    const one = [{ ...metal, quantity: 1 }];
    const shown = shopPrice(one, { percent: 10, perMaterial: {} }, M);
    assert.equal(shown.totalSek, M.endMinOrderSek);
    assert.equal(shown.minimumTopUpSek, M.endMinOrderSek - shown.badgesSek);
  });

  it("validerar procent och material", () => {
    assert.equal(shopPriceListSchema.safeParse({ percent: 400, perMaterial: {} }).success, false);
    assert.equal(shopPriceListSchema.safeParse({ percent: 10, perMaterial: { guld: 5 } }).success, false);
    assert.equal(shopPriceListSchema.safeParse({ percent: 10, perMaterial: { brass: 5 } }).success, true);
  });
});
