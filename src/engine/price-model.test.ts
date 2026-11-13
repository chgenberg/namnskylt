import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_PRICE_MODEL } from "./default-price-model";
import { itemBreakdown, partShare, provisionSplit, resellerPriceTable, endPriceTable, type PriceModel } from "./price-model";
import { priceItems, type PriceItem } from "./pricing";

/** Kalkylens siffror utan startkostnad: reglerna här prövas var för sig, och startkostnaden har egna tester. */
const M: PriceModel = { ...DEFAULT_PRICE_MODEL, startSek: 0 };

const item = (patch: Partial<PriceItem> = {}): PriceItem => ({
  signClass: "premium",
  mounting: "pin",
  extraEngraving: false,
  customShape: false,
  quantity: 1,
  ...patch,
});

describe("provisionen på en del av skylten", () => {
  it("gäller fästen och tillval precis som skylten: nålen 5 kr ger 0,75 kr i provision på första trappsteget", () => {
    assert.deepEqual(partShare(M, 5, 0), { resellerSek: 5, provisionSek: 0.75, supplierSek: 4.25, endSek: 8 });
    assert.deepEqual(partShare(M, 19, 0), { resellerSek: 19, provisionSek: 2.85, supplierSek: 16.15, endSek: 32 });
  });

  it("följer trappstegets procent: 15, 12, 10 och 8 %", () => {
    assert.deepEqual(
      [0, 1, 2, 3].map((tier) => partShare(M, 5, tier).provisionSek),
      [0.75, 0.6, 0.5, 0.4],
    );
    assert.deepEqual(
      [0, 1, 2, 3].map((tier) => partShare(M, 5, tier).supplierSek),
      [4.25, 4.4, 4.5, 4.6],
    );
  });

  it("provision och verkstadens del summerar alltid till det återförsäljaren betalar", () => {
    for (const sek of [0, 1, 5, 9, 11, 19, 43, 73]) {
      for (const tier of [0, 1, 2, 3]) {
        const share = partShare(M, sek, tier);
        assert.equal(Math.round((share.provisionSek + share.supplierSek) * 100), sek * 100, `${sek} kr, steg ${tier}`);
      }
    }
  });
});

describe("specifikationen per skylt", () => {
  it("Premium, 110 st med nål och logga: skylt 59,84, nål 4,40 och logga 16,72 kr till verkstaden", () => {
    const spec = itemBreakdown(M, item({ quantity: 110, extraEngraving: true }));
    assert.equal(spec.tierIndex, 1);
    assert.equal(spec.provisionPercent, 12);
    assert.deepEqual(
      spec.parts.map(({ part, share }) => [part, share.resellerSek, share.supplierSek, share.provisionSek, share.endSek]),
      [
        ["sign", 68, 59.84, 8.16, 113],
        ["mounting", 5, 4.4, 0.6, 8],
        ["extraEngraving", 19, 16.72, 2.28, 32],
      ],
    );
    assert.deepEqual(spec.perSign, { resellerSek: 92, provisionSek: 11.04, supplierSek: 80.96, endSek: 153 });
    assert.deepEqual(spec.minimum, { resellerSek: 0, provisionSek: 0, supplierSek: 0, endSek: 0 });
  });

  it("stämmer med orderns summor: per skylt gånger antal, avrundat till hela kronor", () => {
    const line = item({ quantity: 110, extraEngraving: true });
    const spec = itemBreakdown(M, line);
    const reseller = priceItems([line], resellerPriceTable(M));
    const split = provisionSplit(M, reseller.totalSek, reseller.quantity);
    assert.equal(reseller.totalSek, 10120);
    assert.equal(spec.perSign.resellerSek * 110, reseller.totalSek);
    assert.equal(Math.round(spec.perSign.supplierSek * 110), split.supplierSek);
    assert.equal(Math.round(spec.perSign.provisionSek * 110), split.provisionSek);
    assert.equal(spec.perSign.endSek * 110, priceItems([line], endPriceTable(M)).totalSek);
  });

  it("egen form är en egen rad, bara när den är vald", () => {
    assert.deepEqual(
      itemBreakdown(M, item({ signClass: "standard", customShape: true })).parts.map(({ part }) => part),
      ["sign", "mounting", "customShape"],
    );
    assert.deepEqual(
      itemBreakdown(M, item()).parts.map(({ part }) => part),
      ["sign", "mounting"],
    );
  });

  it("en ensam skylt: minidebiteringen 221 kr delas också, 33,15 kr i provision", () => {
    const spec = itemBreakdown(M, item());
    assert.equal(spec.perSign.resellerSek, 78);
    assert.deepEqual(spec.minimum, { resellerSek: 221, provisionSek: 33.15, supplierSek: 187.85, endSek: 169 });
    const split = provisionSplit(M, 299, 1);
    assert.equal(Math.round(spec.perSign.provisionSek + spec.minimum.provisionSek), split.provisionSek);
    assert.equal(Math.round(spec.perSign.supplierSek + spec.minimum.supplierSek), split.supplierSek);
  });
});

describe("startkostnaden i specifikationen", () => {
  const D = DEFAULT_PRICE_MODEL;

  it("är en egen rad per skylt: 200 kr på 4 skyltar ger 50 kr, varav 7,50 kr i provision", () => {
    const spec = itemBreakdown(D, item({ quantity: 4 }));
    assert.deepEqual(
      spec.parts.map(({ part }) => part),
      ["sign", "mounting", "start"],
    );
    assert.deepEqual(spec.parts.at(-1)?.share, { resellerSek: 50, provisionSek: 7.5, supplierSek: 42.5, endSek: 83 });
    assert.deepEqual(spec.perSign, { resellerSek: 128, provisionSek: 19.2, supplierSek: 108.8, endSek: 213 });
    assert.equal(spec.minimum.resellerSek, 0);
  });

  it("stämmer med orderns pris hos båda parter, även när delen avrundas", () => {
    for (const quantity of [1, 3, 7, 25, 150, 600]) {
      const spec = itemBreakdown(D, item({ quantity, extraEngraving: true }));
      const reseller = priceItems([item({ quantity, extraEngraving: true })], resellerPriceTable(D));
      const end = priceItems([item({ quantity, extraEngraving: true })], endPriceTable(D));
      assert.equal(spec.perSign.resellerSek, reseller.unitSek[0], `inköp, ${quantity} st`);
      assert.equal(spec.perSign.endSek, end.unitSek[0], `kund, ${quantity} st`);
      assert.equal(spec.minimum.resellerSek, reseller.minimumTopUpSek, `minidebitering, ${quantity} st`);
      assert.equal(spec.minimum.endSek, end.minimumTopUpSek, `minsta order, ${quantity} st`);
    }
  });

  it("raden står kvar med 0 kr på en stor order, och saknas när modellen inte har någon startkostnad", () => {
    const large = itemBreakdown(D, item({ quantity: 600 }));
    assert.deepEqual(large.parts.at(-1), { part: "start", share: { resellerSek: 0, provisionSek: 0, supplierSek: 0, endSek: 1 } });
    assert.ok(!itemBreakdown(M, item({ quantity: 4 })).parts.some(({ part }) => part === "start"));
  });
});
