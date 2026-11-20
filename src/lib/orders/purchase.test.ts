import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createBadgeDocument, NO_SHIPPING, priceOrder, resellerOrder } from "@/engine";
import { endPriceTable, resellerPriceTable } from "@/engine/price-model";
import { DEFAULT_PRICE_MODEL } from "@/engine/default-price-model";
import { TIERED_SHIPPING } from "@/engine/testing";
import { shippingFor } from "./price-lists";
import { marginOf } from "./purchase";

/** Kalkylens siffror utan startkostnad: reglerna här prövas var för sig, och startkostnaden har egna tester. */
const M = { ...DEFAULT_PRICE_MODEL, startSek: 0, shipping: NO_SHIPPING };
/** Kalkylen med fraktregeln som har en gräns i varuvärde. */
const TIERED = { ...DEFAULT_PRICE_MODEL, shipping: TIERED_SHIPPING };
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
    const sale = priceOrder(badges, LIST, 0).totalSek;
    const purchase = resellerOrder(badges, PURCHASE).totalSek;
    assert.equal(marginOf(sale, purchase).percent, M.endMarginPercent);
  });

  it("på en ensam skylt äter minidebiteringen upp marginalen", () => {
    const badges = [createBadgeDocument(["Anna Lind"])];
    const sale = priceOrder(badges, LIST, 0).totalSek;
    const purchase = resellerOrder(badges, PURCHASE).totalSek;
    assert.deepEqual(marginOf(sale, purchase), { sek: 0, percent: 0 });
  });

  it("med startkostnad får återförsäljaren marginal även på den: 4 skyltar ger 852 kr mot 512 kr i inköp", () => {
    const badges = [{ ...createBadgeDocument(["Anna Lind"]), quantity: 4 }];
    const withStart = { ...DEFAULT_PRICE_MODEL, shipping: NO_SHIPPING };
    const sale = priceOrder(badges, endPriceTable(withStart), 0).totalSek;
    const purchase = resellerOrder(badges, resellerPriceTable(withStart)).totalSek;
    assert.equal(sale, 4 * (130 + 83));
    assert.equal(purchase, 4 * (78 + 50));
    assert.deepEqual(marginOf(sale, purchase), { sek: 340, percent: 40 });
  });

  it("frakten ger ingen marginal: 20 skyltar har 159 kr frakt hos båda parter och samma marginal i kronor", () => {
    const badges = [{ ...createBadgeDocument(["Anna Lind"]), quantity: 20 }];
    const purchase = resellerOrder(badges, resellerPriceTable(TIERED));
    const sale = priceOrder(badges, endPriceTable(TIERED), shippingFor(TIERED, badges));
    assert.equal(sale.shippingSek, 159);
    assert.equal(purchase.shippingSek, 159);
    const withoutShipping = marginOf(sale.totalSek - sale.shippingSek, purchase.goodsSek);
    assert.equal(marginOf(sale.totalSek, purchase.totalSek).sek, withoutShipping.sek);
  });

  it("kunden betalar samma frakt som återförsäljaren: 3 skyltar går som varubrev för båda, och frakten ger ingen marginal", () => {
    // Kundens varuvärde är 3 × (130 + 111) = 723 kr, över gränsen 500 kr. Återförsäljarens är 3 × (78 + 66,67) = 434,01 kr,
    // och det är det beloppet regeln gäller. Förut betalade kunden 159 kr och återförsäljaren behöll mellanskillnaden.
    const badges = [{ ...createBadgeDocument(["Anna Lind"]), quantity: 3 }];
    const purchase = resellerOrder(badges, resellerPriceTable(TIERED));
    const sale = priceOrder(badges, endPriceTable(TIERED), shippingFor(TIERED, badges));
    assert.equal(purchase.shippingSek, 75);
    assert.equal(sale.shippingSek, 75);
    assert.equal(marginOf(sale.totalSek, purchase.totalSek).sek, 723 - 434.01);
  });
});
