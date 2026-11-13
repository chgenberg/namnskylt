import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createBadgeDocument, DEFAULT_PRICE_MODEL, priceOrder, resellerOrder } from "@/engine";
import { marginOf } from "./purchase";

describe("marginal", () => {
  it("är andel av försäljningspriset", () => {
    assert.deepEqual(marginOf(200, 120), { sek: 80, percent: 40 });
    assert.deepEqual(marginOf(100, 130), { sek: -30, percent: -30 });
    assert.deepEqual(marginOf(0, 0), { sek: 0, percent: null });
  });

  it("vid listpris får återförsäljaren modellens marginal på en order över minsta ordervärde", () => {
    const badges = [{ ...createBadgeDocument(["Anna Lind"]), quantity: 25 }];
    const sale = priceOrder(badges, DEFAULT_PRICE_MODEL).totalSek;
    const purchase = resellerOrder(badges, DEFAULT_PRICE_MODEL).totalSek;
    assert.equal(marginOf(sale, purchase).percent, DEFAULT_PRICE_MODEL.endMarginPercent);
  });

  it("på en ensam skylt äter minidebiteringen upp marginalen", () => {
    const badges = [createBadgeDocument(["Anna Lind"])];
    const sale = priceOrder(badges, DEFAULT_PRICE_MODEL).totalSek;
    const purchase = resellerOrder(badges, DEFAULT_PRICE_MODEL).totalSek;
    assert.deepEqual(marginOf(sale, purchase), { sek: 0, percent: 0 });
  });
});
