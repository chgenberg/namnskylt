import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isLineInvoiceable, parsePricing } from "./pricing";

describe("orderns egna priser", () => {
  it("läses ur databasen, och listpris är ingen prissättning", () => {
    assert.deepEqual(parsePricing({ unitOverrides: [90], discountPercent: 0, extras: [] }), { unitOverrides: [90], discountPercent: 0, extras: [] });
    // Rader sparade före extraraderna saknar fältet.
    assert.deepEqual(parsePricing({ unitOverrides: [], discountPercent: 10 }), { unitOverrides: [], discountPercent: 10, extras: [] });
    assert.equal(parsePricing({ unitOverrides: [], discountPercent: 0, extras: [] }), null);
    assert.equal(parsePricing(null), null);
    assert.equal(parsePricing({ discountPercent: "tio" }), null);
  });

  it("à-priser går att fakturera rad för rad, men inte en rabatt i procent eller extrarader", () => {
    assert.equal(isLineInvoiceable(null), true);
    assert.equal(isLineInvoiceable({ unitOverrides: [90, null], discountPercent: 0, extras: [] }), true);
    assert.equal(isLineInvoiceable({ unitOverrides: [], discountPercent: 10, extras: [] }), false);
    assert.equal(isLineInvoiceable({ unitOverrides: [], discountPercent: 0, extras: [{ label: "Expressorder", amountSek: 300 }] }), false);
  });
});
