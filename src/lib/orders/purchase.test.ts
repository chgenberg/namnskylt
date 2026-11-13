import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createBadgeDocument, priceOrder, resellerOrder } from "@/engine";
import { endPriceTable, resellerPriceTable } from "@/engine/price-model";
import { DEFAULT_PRICE_MODEL } from "@/engine/default-price-model";
import { marginOf } from "./purchase";

/** Kalkylens siffror utan startkostnad: reglerna här prövas var för sig, och startkostnaden har egna tester. */
const M = { ...DEFAULT_PRICE_MODEL, startSek: 0 };
const LIST = endPriceTable(M);
const PURCHASE = resellerPriceTable(M);

describe("marginal", () => {
  it("är andel av försäljningspriset", () => {
    assert.deepEqual(marginOf(200, 120), { sek: 80, percent: 40 });
    assert.deepEqual(marginOf(100, 130), { sek: -30, percent: -30 });
    assert.deepEqual(marginOf(0, 0), { sek: 0, percent: null });
  });

  it("vid listpris får återförsäljaren modellens marginal på en order över minsta ordervärde", () => {
    const badges = [{ ...createBadgeDocument(["Anna Lind"]), quantity: 25 }];
    const sale = priceOrder(badges, LIST).totalSek;
    const purchase = resellerOrder(badges, PURCHASE).totalSek;
    assert.equal(marginOf(sale, purchase).percent, M.endMarginPercent);
  });

  it("på en ensam skylt äter minidebiteringen upp marginalen", () => {
    const badges = [createBadgeDocument(["Anna Lind"])];
    const sale = priceOrder(badges, LIST).totalSek;
    const purchase = resellerOrder(badges, PURCHASE).totalSek;
    assert.deepEqual(marginOf(sale, purchase), { sek: 0, percent: 0 });
  });

  it("med startkostnad får återförsäljaren marginal även på den: 4 skyltar ger 852 kr mot 512 kr i inköp", () => {
    const badges = [{ ...createBadgeDocument(["Anna Lind"]), quantity: 4 }];
    const sale = priceOrder(badges, endPriceTable(DEFAULT_PRICE_MODEL)).totalSek;
    const purchase = resellerOrder(badges, resellerPriceTable(DEFAULT_PRICE_MODEL)).totalSek;
    assert.equal(sale, 4 * (130 + 83));
    assert.equal(purchase, 4 * (78 + 50));
    assert.deepEqual(marginOf(sale, purchase), { sek: 340, percent: 40 });
  });
});
