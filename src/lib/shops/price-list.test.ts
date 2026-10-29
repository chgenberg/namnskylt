import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createBadgeDocument, lineUnitPrices, priceOrder } from "@/engine";
import { shopOrderPricing, shopPrice, shopPriceListSchema, shopUnitPrices } from "./price-list";

const brass = { ...createBadgeDocument(["Anna Berg", "Receptionist"]), quantity: 24 };
const plastic = { ...createBadgeDocument(["Erik"]), materialId: "plastic-2-layer" as const, colorId: "white-black", quantity: 1 };

describe("butikens prislista", () => {
  it("utan prislista är priset riktpriset", () => {
    assert.deepEqual(shopUnitPrices([brass], null), lineUnitPrices([brass]));
    assert.equal(shopPrice([brass], null).totalSek, priceOrder([brass]).totalSek);
    assert.equal(shopOrderPricing([brass], null), null);
    assert.equal(shopOrderPricing([brass], { percent: 0, perMaterial: {} }), null);
  });

  it("lägger påslaget efter mängdrabatten, per material när det finns", () => {
    const list = { percent: 20, perMaterial: { "plastic-2-layer": -10 } };
    const [brassList = 0, plasticList = 0] = lineUnitPrices([brass, plastic]);
    assert.deepEqual(shopUnitPrices([brass, plastic], list), [Math.round(brassList * 1.2), Math.round(plasticList * 0.9)]);
  });

  it("ordern sparas med exakt de priser kunden såg", () => {
    const list = { percent: 35, perMaterial: {} };
    const shown = shopPrice([brass], list);
    const pricing = shopOrderPricing([brass], list);
    assert.ok(pricing);
    assert.equal((pricing.unitOverrides[0] ?? 0) * brass.quantity, shown.totalSek);
  });

  it("validerar procent och material", () => {
    assert.equal(shopPriceListSchema.safeParse({ percent: 400, perMaterial: {} }).success, false);
    assert.equal(shopPriceListSchema.safeParse({ percent: 10, perMaterial: { guld: 5 } }).success, false);
    assert.equal(shopPriceListSchema.safeParse({ percent: 10, perMaterial: { brass: 5 } }).success, true);
  });
});
