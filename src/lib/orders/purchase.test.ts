import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createBadgeDocument, lineUnitPrices, type BadgeDocument } from "@/engine";
import { marginOf, purchasePercentFor, purchasePrice, purchaseTermsSchema, type PurchaseTerms } from "./purchase";

const brass: BadgeDocument = { ...createBadgeDocument(["Anna Lind"]), materialId: "brass", colorId: "brass-gold", quantity: 2 };
const plastic: BadgeDocument = { ...createBadgeDocument(["Bo Ek"]), materialId: "plastic-2-layer", colorId: "white-black" };
const terms: PurchaseTerms = { generalPercent: 40, perMaterial: { brass: 30 } };

describe("inköpspris", () => {
  it("använder materialets procent före den generella", () => {
    assert.equal(purchasePercentFor(terms, "brass"), 30);
    assert.equal(purchasePercentFor(terms, "plastic-2-layer"), 40);
  });

  it("räknar rabatten på listpriset efter mängdrabatten", () => {
    const [brassList = 0, plasticList = 0] = lineUnitPrices([brass, plastic]);
    const price = purchasePrice([brass, plastic], terms);
    const [brassUnit = 0, plasticUnit = 0] = price.unitSek;
    assert.deepEqual(price.unitSek, [Math.round(brassList * 0.7), Math.round(plasticList * 0.6)]);
    assert.equal(price.totalSek, brassUnit * 2 + plasticUnit);
  });

  it("utan rabatt är inköpet listpriset", () => {
    const price = purchasePrice([plastic], { generalPercent: 0, perMaterial: {} });
    assert.deepEqual(price.unitSek, lineUnitPrices([plastic]));
  });
});

describe("marginal", () => {
  it("är andel av försäljningspriset", () => {
    assert.deepEqual(marginOf(200, 120), { sek: 80, percent: 40 });
    assert.deepEqual(marginOf(100, 130), { sek: -30, percent: -30 });
    assert.deepEqual(marginOf(0, 0), { sek: 0, percent: null });
  });
});

describe("purchaseTermsSchema", () => {
  it("avvisar okända material och orimliga procent", () => {
    assert.equal(purchaseTermsSchema.safeParse({ generalPercent: 40, perMaterial: { brass: 30 } }).success, true);
    assert.equal(purchaseTermsSchema.safeParse({ generalPercent: 40, perMaterial: { gold: 30 } }).success, false);
    assert.equal(purchaseTermsSchema.safeParse({ generalPercent: 95, perMaterial: {} }).success, false);
    assert.equal(purchaseTermsSchema.safeParse({ generalPercent: -1, perMaterial: {} }).success, false);
  });
});
