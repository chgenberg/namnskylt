import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_PRICE_MODEL } from "./default-price-model";
import {
  endPriceTable,
  itemBreakdown,
  partShare,
  priceModelSchema,
  provisionPercentFor,
  provisionPercentRange,
  provisionSplit,
  resellerPriceTable,
  tierCounts,
  type PriceModel,
} from "./price-model";
import { NO_SHIPPING, priceItems, toOre, type PriceItem } from "./pricing";

/** Kalkylens siffror utan startkostnad: reglerna här prövas var för sig, och startkostnaden har egna tester. */
const M: PriceModel = { ...DEFAULT_PRICE_MODEL, startSek: 0, shipping: NO_SHIPPING };

const item = (patch: Partial<PriceItem> = {}): PriceItem => ({
  signClass: "premium",
  mounting: "pin",
  extraEngraving: false,
  customShape: false,
  quantity: 1,
  ...patch,
});

describe("provisionen på en del av skylten", () => {
  it("gäller fästen och tillval precis som skylten: nålen 5 kr ger 0,75 kr i provision vid 15 %", () => {
    assert.deepEqual(partShare(M, 5, 15), { resellerSek: 5, provisionSek: 0.75, supplierSek: 4.25, endSek: 8 });
    assert.deepEqual(partShare(M, 19, 15), { resellerSek: 19, provisionSek: 2.85, supplierSek: 16.15, endSek: 32 });
  });

  it("följer procenten: 15, 12, 10 och 8 %", () => {
    assert.deepEqual(
      [15, 12, 10, 8].map((percent) => partShare(M, 5, percent).provisionSek),
      [0.75, 0.6, 0.5, 0.4],
    );
    assert.deepEqual(
      [15, 12, 10, 8].map((percent) => partShare(M, 5, percent).supplierSek),
      [4.25, 4.4, 4.5, 4.6],
    );
  });

  it("provision och verkstadens del summerar alltid till det återförsäljaren betalar, även med ören", () => {
    for (const sek of [0, 1, 5, 9, 11, 19, 43, 73, 72.94, 0.33]) {
      for (const percent of [15, 12, 10, 8, 14.97, 12.5714]) {
        const share = partShare(M, sek, percent);
        assert.equal(Math.round((share.provisionSek + share.supplierSek) * 100), Math.round(sek * 100), `${sek} kr, ${percent} %`);
      }
    }
  });
});

describe("provisionen räknas steg för steg", () => {
  const percent = (quantity: number) => Math.round(provisionPercentFor(M, quantity) * 100) / 100;

  it("orderns skyltar fördelas på trappstegen: 350 skyltar är 100, 200 och 50", () => {
    assert.deepEqual(tierCounts(M, 350), [100, 200, 50, 0]);
    assert.deepEqual(tierCounts(M, 100), [100, 0, 0, 0]);
    assert.deepEqual(tierCounts(M, 101), [100, 1, 0, 0]);
    assert.deepEqual(tierCounts(M, 1000), [100, 200, 200, 500]);
  });

  it("350 skyltar: 100 st à 15 %, 200 st à 12 % och 50 st à 10 % ger 12,57 % på hela ordern", () => {
    assert.equal(provisionPercentFor(M, 350), (100 * 15 + 200 * 12 + 50 * 10) / 350);
    assert.equal(percent(350), 12.57);
  });

  it("upp till 100 skyltar gäller 15 % på allt", () => {
    for (const quantity of [1, 50, 100]) assert.equal(provisionPercentFor(M, quantity), 15);
  });

  it("skylt 101 sänker inte provisionen på de första 100: 6 868 kr ger 1 028,16 kr, inte 824 kr", () => {
    assert.equal(percent(101), 14.97);
    assert.deepEqual(provisionSplit(M, 101 * 68, 101), {
      provisionPercent: (100 * 15 + 12) / 101,
      provisionSek: 1028.16,
      supplierSek: 5839.84,
    });
  });

  it("med samma pris per skylt ger fler skyltar aldrig mindre provision", () => {
    let previous = 0;
    for (let quantity = 1; quantity <= 700; quantity++) {
      const { provisionSek } = provisionSplit(M, quantity * 73, quantity);
      assert.ok(provisionSek > previous, `${quantity} st ger ${provisionSek} kr, ${quantity - 1} st gav ${previous} kr`);
      previous = provisionSek;
    }
  });

  it("på ett trappsteg ligger orderns provision mellan stegets första och sista antal", () => {
    const range = (tier: number) => {
      const { min, max } = provisionPercentRange(M, tier);
      return [Math.round(min * 100) / 100, Math.round(max * 100) / 100];
    };
    assert.deepEqual(range(0), [15, 15]);
    assert.deepEqual(range(1), [13, 14.97]);
    assert.deepEqual(range(2), [11.8, 12.99]);
    // Sista steget har inget sista antal: provisionen går mot stegets 8 % när ordern växer.
    assert.deepEqual(range(3), [8, 11.79]);
  });

  it("provisionen har ören och summerar med verkstadens del till det återförsäljaren betalar", () => {
    for (const [total, quantity] of [[299, 1], [7373, 101], [10950, 150], [11899.5, 150], [25550.25, 350]] as const) {
      const split = provisionSplit(M, total, quantity);
      assert.equal(Math.round(split.provisionSek * 100) + Math.round(split.supplierSek * 100), Math.round(total * 100), `${total} kr`);
      assert.equal(split.provisionSek, Math.round(split.provisionSek * 100) / 100);
    }
  });
});

describe("specifikationen per skylt", () => {
  it("Premium, 110 st med nål och logga: 100 st à 15 % och 10 st à 12 % ger 14,73 % på varje del", () => {
    const spec = itemBreakdown(M, item({ quantity: 110, extraEngraving: true }));
    assert.equal(spec.tierIndex, 1);
    assert.equal(spec.provisionPercent, (100 * 15 + 10 * 12) / 110);
    assert.deepEqual(
      spec.parts.map(({ part, share }) => [part, share.resellerSek, share.supplierSek, share.provisionSek, share.endSek]),
      [
        ["sign", 68, 57.99, 10.01, 113],
        ["mounting", 5, 4.26, 0.74, 8],
        ["extraEngraving", 19, 16.2, 2.8, 32],
      ],
    );
    assert.deepEqual(spec.perSign, { resellerSek: 92, provisionSek: 13.55, supplierSek: 78.45, endSek: 153 });
    assert.deepEqual(spec.minimum, { resellerSek: 0, provisionSek: 0, supplierSek: 0, endSek: 0 });
  });

  it("stämmer med orderns summor: priserna exakt, provisionen inom avrundningen per del", () => {
    const line = item({ quantity: 110, extraEngraving: true });
    const spec = itemBreakdown(M, line);
    const reseller = priceItems([line], resellerPriceTable(M));
    const split = provisionSplit(M, reseller.totalSek, reseller.quantity);
    assert.equal(reseller.totalSek, 10120);
    assert.equal(spec.perSign.resellerSek * 110, reseller.totalSek);
    assert.equal(spec.perSign.endSek * 110, priceItems([line], endPriceTable(M)).totalSek);
    assert.deepEqual([split.provisionSek, split.supplierSek], [1490.4, 8629.6]);
    // Varje del avrundas till ören för sig: högst ett halvt öre per del och skylt.
    const slack = 110 * spec.parts.length * 0.005;
    assert.ok(Math.abs(spec.perSign.provisionSek * 110 - split.provisionSek) <= slack);
    assert.ok(Math.abs(spec.perSign.supplierSek * 110 - split.supplierSek) <= slack);
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

  it("utan fäste i kalkylen: bara skylten räknas, 73 kr per skylt", () => {
    const bare = item({ mounting: null, quantity: 10 });
    const spec = itemBreakdown(M, bare);
    assert.deepEqual(
      spec.parts.map(({ part }) => part),
      ["sign"],
    );
    assert.deepEqual(spec.perSign, { resellerSek: 73, provisionSek: 10.95, supplierSek: 62.05, endSek: 122 });
    assert.equal(priceItems([bare], resellerPriceTable(M)).totalSek, 730);
    assert.equal(priceItems([bare], endPriceTable(M)).totalSek, 1220);
  });

  it("en ensam skylt: minidebiteringen 221 kr delas också, 33,15 kr i provision", () => {
    const spec = itemBreakdown(M, item());
    assert.equal(spec.perSign.resellerSek, 78);
    assert.deepEqual(spec.minimum, { resellerSek: 221, provisionSek: 33.15, supplierSek: 187.85, endSek: 169 });
    const split = provisionSplit(M, 299, 1);
    assert.deepEqual([split.provisionSek, split.supplierSek], [44.85, 254.15]);
    assert.equal(toOre(spec.perSign.provisionSek + spec.minimum.provisionSek), split.provisionSek);
    assert.equal(toOre(spec.perSign.supplierSek + spec.minimum.supplierSek), split.supplierSek);
  });
});

describe("startkostnaden i specifikationen", () => {
  /** Kalkylen utan frakt. Frakten har egna tester. */
  const D: PriceModel = { ...DEFAULT_PRICE_MODEL, shipping: NO_SHIPPING };

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

  it("på en stor order är delen ören för återförsäljaren och en krona för slutkunden", () => {
    const large = itemBreakdown(D, item({ quantity: 600 }));
    assert.deepEqual(large.parts.at(-1), { part: "start", share: { resellerSek: 0.33, provisionSek: 0.04, supplierSek: 0.29, endSek: 1 } });
  });

  it("raden saknas när modellen inte har någon startkostnad", () => {
    assert.ok(!itemBreakdown(M, item({ quantity: 4 })).parts.some(({ part }) => part === "start"));
  });
});

describe("priser med ören", () => {
  /** Premium 72,94 kr på första trappsteget: 62,00 kr till verkstaden efter 15 % provision. */
  const O: PriceModel = { ...M, signs: { ...M.signs, premium: [72.94, 68.5, 64, 61] } };

  it("modellen godtar ören i det återförsäljaren betalar, men inte fler decimaler", () => {
    assert.equal(priceModelSchema.safeParse(O).success, true);
    assert.equal(priceModelSchema.safeParse({ ...O, startSek: 199.5, minOrderSek: 299.9 }).success, true);
    assert.equal(priceModelSchema.safeParse({ ...O, options: { ...O.options, pin: [4.75, 4.5, 4.25, 4] } }).success, true);
    assert.equal(priceModelSchema.safeParse({ ...O, signs: { ...O.signs, premium: [72.945, 68, 64, 61] } }).success, false);
    assert.equal(priceModelSchema.safeParse({ ...O, startSek: 199.555 }).success, false);
  });

  it("slutkundens minsta order är hela kronor", () => {
    assert.equal(priceModelSchema.safeParse({ ...O, endMinOrderSek: 299.5 }).success, false);
  });

  it("verkstaden får exakt 62,00 kr av 72,94 kr", () => {
    assert.deepEqual(partShare(O, 72.94, 15), { resellerSek: 72.94, provisionSek: 10.94, supplierSek: 62, endSek: 122 });
  });

  it("återförsäljaren betalar med ören: 10 skyltar med nål kostar 779,40 kr", () => {
    const order = priceItems([item({ quantity: 10 })], resellerPriceTable(O));
    assert.deepEqual(order.unitSek, [77.94]);
    assert.equal(order.totalSek, 779.4);
    assert.deepEqual(provisionSplit(O, order.totalSek, order.quantity), { provisionPercent: 15, provisionSek: 116.91, supplierSek: 662.49 });
  });

  it("minidebiteringen fyller upp till exakt 299 kr", () => {
    const order = priceItems([item({ quantity: 3 })], resellerPriceTable(O));
    assert.equal(order.badgesSek, 233.82);
    assert.equal(order.minimumTopUpSek, 65.18);
    assert.equal(order.totalSek, 299);
  });

  it("slutkundens priser är fortfarande hela kronor", () => {
    const list = endPriceTable(O);
    assert.deepEqual(list.signs.premium, [122, 114, 107, 102]);
    const order = priceItems([item({ quantity: 10 })], list);
    assert.ok(Number.isInteger(order.totalSek));
    assert.equal(list.ore, undefined);
    assert.equal(resellerPriceTable(O).ore, true);
  });
});
