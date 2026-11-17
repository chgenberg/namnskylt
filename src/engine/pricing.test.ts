import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createBadgeDocument, withBlank, withShapePreset } from "./document";
import { BLANKS } from "./catalog";
import { DEFAULT_PRICE_MODEL } from "./default-price-model";
import {
  NO_SHIPPING,
  badgePriceParts,
  fromPriceSek,
  lastTierIndex,
  lineUnitPrices,
  mountingPriceSek,
  optionPriceSek,
  priceItems,
  priceOrder,
  resellerOrder,
  shippingKind,
  shippingSek,
  startShareSek,
  tierIndexFor,
  tierRangeLabel,
  withoutStartCost,
  withShippingMethod,
  withStartInSign,
  type PriceItem,
} from "./pricing";
import {
  endPriceSek,
  endPriceTable,
  orderShippingSek,
  parseStoredPriceModel,
  priceModelSchema,
  provisionSplit,
  resellerPriceTable,
  type PriceModel,
} from "./price-model";
import type { BadgeDocument } from "./types";

/**
 * Kalkylen med ett eget pris på loggan, som den var före 2026-11-16. Sedan dess ingår loggan
 * (priset är 0 kr), men räknereglerna för en prissatt logga gäller om ägaren sätter ett pris igen.
 */
const KALKYL: typeof DEFAULT_PRICE_MODEL = {
  ...DEFAULT_PRICE_MODEL,
  options: { ...DEFAULT_PRICE_MODEL.options, extraEngraving: [19, 19, 19, 19] },
};

/** Kalkylens siffror utan startkostnad: reglerna här prövas var för sig, och startkostnaden har egna tester. */
const M: PriceModel = { ...KALKYL, startSek: 0, shipping: NO_SHIPPING };
/** Det återförsäljaren betalar. */
const PURCHASE = resellerPriceTable(M);
/** Det slutkunden betalar. */
const LIST = endPriceTable(M);

const premium = (quantity: number, patch: Partial<PriceItem> = {}): PriceItem => ({
  signClass: "premium",
  mounting: "pin",
  extraEngraving: false,
  customShape: false,
  quantity,
  ...patch,
});

describe("kalkylens siffror", () => {
  it("har fyra trappsteg: 1–100, 101–300, 301–500 och 501 eller fler", () => {
    assert.deepEqual(
      [1, 100, 101, 300, 301, 500, 501, 5000].map((q) => tierIndexFor(q, PURCHASE)),
      [0, 0, 1, 1, 2, 2, 3, 3],
    );
    assert.deepEqual(
      PURCHASE.tiers.map((_, i) => tierRangeLabel(i, PURCHASE)),
      ["1–100 st", "101–300 st", "301–500 st", "501 st eller fler"],
    );
  });

  it("återförsäljaren betalar tabellens pris: Premium 73, 68, 64 och 61 kr, Standard 54, 50, 47 och 43 kr", () => {
    const bare = resellerPriceTable({ ...M, options: { ...M.options, pin: [0, 0, 0, 0] }, minOrderSek: 0 });
    for (const [signClass, expected] of [
      ["premium", [73, 68, 64, 61]],
      ["standard", [54, 50, 47, 43]],
    ] as const) {
      const units = [100, 101, 301, 501].map((quantity) => priceItems([premium(quantity, { signClass })], bare).unitSek[0]);
      assert.deepEqual(units, expected, signClass);
    }
  });

  it("provisionen är plattformens andel och resten går till verkstaden: 73 kr blir 10,95 och 62,05", () => {
    assert.deepEqual(provisionSplit(M, 73, 1), { provisionPercent: 15, provisionSek: 10.95, supplierSek: 62.05 });
    // Över 100 skyltar räknas provisionen steg för steg; reglerna prövas i price-model.test.ts.
    assert.equal(provisionSplit(M, 1000, 100).provisionPercent, 15);
    assert.ok(provisionSplit(M, 1000, 101).provisionPercent < 15);
    assert.ok(provisionSplit(M, 1000, 101).provisionPercent > 12);
  });

  it("tillvalen läggs på skylten: nål 5, klämma 9, magnet 11 och logga 19 kr", () => {
    const unit = (patch: Partial<PriceItem>) => priceItems([premium(200, patch)], PURCHASE).unitSek[0];
    assert.equal(unit({}), 68 + 5);
    assert.equal(unit({ mounting: "clip" }), 68 + 9);
    assert.equal(unit({ mounting: "magnet" }), 68 + 11);
    assert.equal(unit({ mounting: "magnet", extraEngraving: true }), 68 + 11 + 19);
  });

  it("egen form kostar 19 kr extra per skylt, och slutkunden betalar 32 kr", () => {
    const plain = priceItems([premium(200, { signClass: "standard" })], PURCHASE).unitSek[0];
    const custom = priceItems([premium(200, { signClass: "standard", customShape: true })], PURCHASE).unitSek[0];
    assert.equal(plain, 50 + 5);
    assert.equal(custom, 50 + 5 + 19);
    const doc = { ...withShapePreset({ ...createBadgeDocument(["Anna"]), materialId: "plastic" as const, colorId: "white-black" }, "star"), quantity: 10 };
    assert.equal(priceOrder([doc], LIST, 0).unitSek, endPriceSek(54, M) + 8 + 32);
  });

  it("en äldre skylt med säkerhetsnål prissätts som nål", () => {
    assert.equal(priceItems([premium(200, { mounting: "safety-pin" })], PURCHASE).unitSek[0], 68 + 5);
  });
});

describe("minidebiteringen", () => {
  it("återförsäljaren betalar minst 299 kr, och provisionen räknas på hela beloppet", () => {
    const order = priceItems([premium(1)], PURCHASE);
    assert.equal(order.badgesSek, 78);
    assert.equal(order.minimumTopUpSek, 221);
    assert.equal(order.totalSek, 299);
    assert.deepEqual(provisionSplit(M, order.totalSek, order.quantity), { provisionPercent: 15, provisionSek: 44.85, supplierSek: 254.15 });
  });

  it("en order över gränsen får inget påslag", () => {
    const order = priceItems([premium(4)], PURCHASE);
    assert.equal(order.totalSek, 4 * 78);
    assert.equal(order.minimumTopUpSek, 0);
  });
});

describe("slutkundens pris", () => {
  it("räknas med marginal, inte påslag: 73 kr och 40 % blir 122 kr", () => {
    assert.equal(endPriceSek(73, M), 122);
    assert.equal(endPriceSek(73, { ...M, endMarginPercent: 0 }), 73);
    assert.equal(endPriceSek(60, { ...M, endMarginPercent: 50 }), 120);
    assert.deepEqual(LIST.signs.premium, [122, 113, 107, 102]);
  });

  it("delarna avrundas var för sig så att skylt, fäste och logga summerar till priset", () => {
    const [unit] = lineUnitPrices([{ ...createBadgeDocument(["Anna"]), mounting: "magnet" }], LIST);
    assert.equal(unit, 122 + mountingPriceSek("magnet", LIST));
    assert.equal(mountingPriceSek("pin", LIST), 8);
    assert.equal(mountingPriceSek("clip", LIST), 15);
    assert.equal(mountingPriceSek("magnet", LIST), 18);
  });

  it("från-priset är skylten med det billigaste fästet, och det är vad en skylt kostar", () => {
    assert.equal(fromPriceSek("metal", LIST), 130);
    assert.equal(fromPriceSek("plastic", LIST), 90 + 8);
    assert.equal(priceOrder([{ ...createBadgeDocument(["Anna"]), quantity: 10 }], LIST, 0).unitSek, 130);
    assert.equal(fromPriceSek("metal", LIST, 3), 102 + 8);
  });

  it("alla fyra ämnen kostar lika", () => {
    for (const blank of BLANKS) {
      const doc = { ...withBlank(createBadgeDocument(["Anna"]), blank.id), quantity: 10 };
      assert.equal(priceOrder([doc], LIST, 0).unitSek, 130, blank.id);
    }
  });

  it("minsta ordervärde är 299 kr: en ensam skylt kostar 299, inte 130", () => {
    const one = priceOrder([createBadgeDocument(["Anna"])], LIST, 0);
    assert.equal(one.badgesSek, 130);
    assert.equal(one.minimumTopUpSek, 169);
    assert.equal(one.totalSek, 299);
    assert.equal(one.totalInclVatSek, 374);
    assert.equal(priceOrder([{ ...createBadgeDocument(["Anna"]), quantity: 3 }], LIST, 0).minimumTopUpSek, 0);
  });

  it("trappsteget gäller orderns totala antal, även när alla skyltar har olika namn", () => {
    const names: BadgeDocument[] = Array.from({ length: 101 }, (_, i) => createBadgeDocument([`Person ${i}`]));
    const order = priceOrder(names, LIST, 0);
    assert.equal(order.quantity, 101);
    assert.equal(order.tierIndex, 1);
    assert.equal(order.unitSek, 113 + 8);
    assert.equal(resellerOrder(names, PURCHASE).unitSek[0], 68 + 5);
  });
});

describe("startkostnaden", () => {
  /** Kalkylen utan frakt. Frakten har egna tester. */
  const D: PriceModel = { ...KALKYL, shipping: NO_SHIPPING };
  const purchase = resellerPriceTable(D);
  const list = endPriceTable(D);
  const anna = (quantity: number): BadgeDocument => ({ ...createBadgeDocument(["Anna"]), quantity });

  it("delas på antalet skyltar: 200 kr på 4 skyltar lägger 50 kr på varje", () => {
    assert.equal(D.startSek, 200);
    const order = priceItems([premium(4)], purchase);
    assert.equal(order.startShareSek, 50);
    assert.deepEqual(order.unitSek, [78 + 50]);
    assert.equal(order.totalSek, 4 * 128);
    assert.equal(order.minimumTopUpSek, 0);
  });

  it("slutkunden betalar den med samma marginal som priset per skylt: 333 kr, 83 kr per skylt på 4 skyltar", () => {
    assert.equal(list.startSek, 333);
    const order = priceOrder([anna(4)], list, 0);
    assert.equal(order.startShareSek, 83);
    assert.equal(order.unitSek, 130 + 83);
    assert.equal(order.totalSek, 4 * 213);
  });

  it("gäller orderns totala antal, även när alla skyltar har olika namn", () => {
    const names = Array.from({ length: 4 }, (_, i) => createBadgeDocument([`Person ${i}`]));
    assert.deepEqual(resellerOrder(names, purchase).unitSek, [128, 128, 128, 128]);
    assert.deepEqual(lineUnitPrices(names, list), [213, 213, 213, 213]);
  });

  it("slutkundens del avrundas till hela kronor: 3 skyltar ger 111 kr, 150 ger 2 kr och över 666 skyltar blir den 0", () => {
    assert.deepEqual(
      [1, 3, 7, 100, 150, 401, 667].map((quantity) => startShareSek(quantity, list)),
      [333, 111, 48, 3, 2, 1, 0],
    );
    assert.equal(startShareSek(0, list), 0);
  });

  it("återförsäljarens del avrundas till ören: 3 skyltar ger 66,67 kr och 150 ger 1,33 kr", () => {
    assert.deepEqual(
      [1, 3, 7, 100, 150, 401].map((quantity) => startShareSek(quantity, purchase)),
      [200, 66.67, 28.57, 2, 1.33, 0.5],
    );
    assert.equal(startShareSek(0, purchase), 0);
    // 150 skyltar bär 199,50 kr av startkostnaden på 200 kr, inte 150 kr som med hela kronor.
    const order = priceItems([premium(150)], purchase);
    assert.deepEqual(order.unitSek, [68 + 5 + 1.33]);
    assert.equal(order.totalSek, 150 * 73 + 199.5);
  });

  it("en ensam skylt bär hela startkostnaden, och minidebiteringen fyller bara upp resten", () => {
    const reseller = priceItems([premium(1)], purchase);
    assert.equal(reseller.badgesSek, 78 + 200);
    assert.equal(reseller.minimumTopUpSek, 21);
    assert.equal(reseller.totalSek, 299);
    const customer = priceOrder([anna(1)], list, 0);
    assert.equal(customer.badgesSek, 130 + 333);
    assert.equal(customer.minimumTopUpSek, 0);
  });

  it("provisionen gäller startkostnaden som allt annat: 512 kr ger 76,80 kr", () => {
    const order = priceItems([premium(4)], purchase);
    assert.deepEqual(provisionSplit(D, order.totalSek, order.quantity), { provisionPercent: 15, provisionSek: 76.8, supplierSek: 435.2 });
  });

  it("från-priset och ett listpris utan startkostnad påverkas inte", () => {
    assert.equal(fromPriceSek("metal", list), 130);
    assert.equal(priceOrder([anna(10)], withoutStartCost(list), 0).unitSek, 130);
    assert.equal(withoutStartCost(list).minOrderSek, list.minOrderSek);
  });
});

describe("vad som ingår i priset per skylt", () => {
  /** Kalkylen utan frakt. Frakten har egna tester. */
  const D: PriceModel = { ...KALKYL, shipping: NO_SHIPPING };
  const list = endPriceTable(D);
  const parts = (doc: BadgeDocument, quantity: number) => badgePriceParts(doc, quantity, list).map(({ part, sek }) => [part, sek]);

  it("skylt, fäste och startkostnad: 122 + 15 + 56 kr för en metallskylt med klämma i en order på 6", () => {
    const doc: BadgeDocument = { ...createBadgeDocument(["Anna"]), mounting: "clip", quantity: 6 };
    assert.deepEqual(parts(doc, 6), [
      ["sign", 122],
      ["mounting", 15],
      ["start", 56],
    ]);
  });

  it("logga och egen form är egna rader", () => {
    const plastic = { ...createBadgeDocument(["Anna"]), materialId: "plastic" as const, colorId: "white-black" };
    const doc: BadgeDocument = { ...withShapePreset(plastic, "star"), logo: { d: "M0 0h1v1z", viewWidth: 1, viewHeight: 1, placement: "top", heightMm: 10 }, quantity: 6 };
    assert.deepEqual(
      parts(doc, 6).map(([part]) => part),
      ["sign", "mounting", "extraEngraving", "customShape", "start"],
    );
  });

  it("delarna summerar alltid till skyltens à-pris, på alla trappsteg", () => {
    for (const quantity of [1, 3, 6, 100, 101, 350, 700]) {
      const doc: BadgeDocument = { ...createBadgeDocument(["Anna"]), mounting: "magnet", quantity };
      const sum = badgePriceParts(doc, quantity, list).reduce((total, { sek }) => total + sek, 0);
      assert.equal(sum, lineUnitPrices([doc], list)[0], `${quantity} st`);
    }
  });

  it("trappsteget och startkostnaden följer orderns antal, inte skyltens", () => {
    const doc: BadgeDocument = { ...createBadgeDocument(["Anna"]), quantity: 1 };
    assert.deepEqual(parts(doc, 200), [
      ["sign", 113],
      ["mounting", 8],
      ["start", 2],
    ]);
  });

  it("utan startkostnad i listan finns ingen sådan rad", () => {
    const doc: BadgeDocument = { ...createBadgeDocument(["Anna"]), quantity: 6 };
    assert.deepEqual(
      badgePriceParts(doc, 6, withoutStartCost(list)).map(({ part }) => part),
      ["sign", "mounting"],
    );
  });

  it("mot kunden ligger startkostnaden på skylten: 122 + 13 = 135 kr i en order på 25", () => {
    const doc: BadgeDocument = { ...createBadgeDocument(["Anna"]), quantity: 25 };
    assert.deepEqual(
      withStartInSign(badgePriceParts(doc, 25, list)).map(({ part, sek }) => [part, sek]),
      [
        ["sign", 135],
        ["mounting", 8],
      ],
    );
  });

  it("återförsäljarens skylt i samma order: 73 + 8 = 81 kr", () => {
    const doc: BadgeDocument = { ...createBadgeDocument(["Anna"]), quantity: 25 };
    assert.deepEqual(
      withStartInSign(badgePriceParts(doc, 25, resellerPriceTable(D))).map(({ part, sek }) => [part, sek]),
      [
        ["sign", 81],
        ["mounting", 5],
      ],
    );
  });

  it("summan är densamma med startkostnaden på skylten, och ingen egen rad finns kvar", () => {
    for (const quantity of [1, 3, 6, 100, 101, 350, 700]) {
      const doc: BadgeDocument = { ...createBadgeDocument(["Anna"]), mounting: "magnet", quantity };
      const shown = withStartInSign(badgePriceParts(doc, quantity, list));
      assert.equal(
        shown.reduce((total, { sek }) => total + sek, 0),
        lineUnitPrices([doc], list)[0],
        `${quantity} st`,
      );
      assert.ok(shown.every(({ part }) => (part as string) !== "start"));
    }
  });

  it("utan startkostnad ändras ingenting", () => {
    const doc: BadgeDocument = { ...createBadgeDocument(["Anna"]), quantity: 6 };
    const parts = badgePriceParts(doc, 6, withoutStartCost(list));
    assert.deepEqual(withStartInSign(parts), parts);
  });
});

describe("tillbehör och tillval per trappsteg", () => {
  const tiered: PriceModel = { ...M, options: { ...M.options, pin: [5, 4, 3, 2], extraEngraving: [19, 17, 15, 13] } };
  const purchase = resellerPriceTable(tiered);
  const list = endPriceTable(tiered);

  it("fästet och tillvalet följer orderns trappsteg", () => {
    const units = [100, 101, 301, 501].map((quantity) => priceItems([premium(quantity, { extraEngraving: true })], purchase).unitSek[0]);
    assert.deepEqual(units, [73 + 5 + 19, 68 + 4 + 17, 64 + 3 + 15, 61 + 2 + 13]);
    assert.deepEqual([0, 1, 2, 3].map((tier) => mountingPriceSek("pin", purchase, tier)), [5, 4, 3, 2]);
  });

  it("slutkundens pris räknas med marginalen på varje trappsteg", () => {
    assert.deepEqual(list.options.pin, [8, 7, 5, 3]);
    assert.deepEqual(list.options.extraEngraving, [32, 28, 25, 22]);
  });

  it("från-priset tar trappstegets billigaste fäste", () => {
    assert.equal(fromPriceSek("metal", list, 0), 122 + 8);
    assert.equal(fromPriceSek("metal", list, 3), 102 + 3);
  });

  it("priset från i väljarna är det som gäller på sista trappsteget, 501 eller fler", () => {
    const last = lastTierIndex(list);
    assert.equal(last, 3);
    assert.equal(tierRangeLabel(last, list), "501 st eller fler");
    assert.equal(mountingPriceSek("pin", list, last), 3);
    assert.equal(optionPriceSek("extraEngraving", list, last), 22);
    // En lista utan trappsteg har bara ett pris.
    assert.equal(lastTierIndex({ ...list, tiers: [] }), 0);
  });

  it("modellen kräver ett pris per trappsteg", () => {
    assert.equal(priceModelSchema.safeParse(tiered).success, true);
    assert.equal(priceModelSchema.safeParse({ ...tiered, options: { ...tiered.options, pin: [5, 4, 3] } }).success, false);
    assert.equal(priceModelSchema.safeParse({ ...tiered, options: { ...tiered.options, pin: 5 } }).success, false);
    assert.equal(priceModelSchema.safeParse({ ...tiered, startSek: -1 }).success, false);
  });
});

describe("frakten", () => {
  /** Kalkylen med frakt men utan startkostnad: 10 skyltar med nål är 780 kr hos återförsäljaren och 1 300 kr hos kunden. */
  const S: PriceModel = { ...M, shipping: KALKYL.shipping };
  const purchase = resellerPriceTable(S);
  const list = endPriceTable(S);

  it("kalkylen har Skylt & Gravyrtekniks frakt: varubrev 75 kr upp till 500 kr, annars paket 159 kr", () => {
    assert.deepEqual(KALKYL.shipping, { letterSek: 75, parcelSek: 159, letterMaxSek: 500 });
  });

  it("gränsen gäller varuvärdet: precis 500 kr går som varubrev, en krona till som paket", () => {
    assert.equal(shippingKind(500, purchase), "letter");
    assert.equal(shippingSek(500, purchase), 75);
    assert.equal(shippingKind(501, purchase), "parcel");
    assert.equal(shippingSek(500.01, purchase), 159);
  });

  it("regeln finns bara i återförsäljarens lista, eftersom frakten räknas på det återförsäljaren betalar", () => {
    assert.deepEqual(purchase.shipping, S.shipping);
    assert.equal(list.shipping, undefined);
    assert.equal(priceItems([premium(10)], list).shippingSek, 0);
  });

  it("frakten är samma i alla led: 3 skyltar går som varubrev fast kunden betalar över 500 kr för dem", () => {
    // Hela kalkylen, med startkostnaden: återförsäljaren betalar 434,01 kr och kunden 723 kr för varorna.
    const D = KALKYL;
    const doc: BadgeDocument = { ...createBadgeDocument(["Anna Lind"]), quantity: 3 };
    const reseller = resellerOrder([doc], resellerPriceTable(D));
    assert.equal(reseller.goodsSek, 434.01);
    assert.equal(reseller.shippingSek, 75);
    const shipping = orderShippingSek(D, [premium(3)]);
    assert.equal(shipping, 75);
    const customer = priceOrder([doc], endPriceTable(D), shipping);
    assert.equal(customer.totalSek - customer.shippingSek, 723);
    assert.equal(customer.shippingSek, reseller.shippingSek);
  });

  it("en skylt till, och båda betalar för paket", () => {
    const D = KALKYL;
    assert.equal(priceItems([premium(4)], resellerPriceTable(D)).goodsSek, 512);
    assert.equal(orderShippingSek(D, [premium(4)]), 159);
  });

  it("frakten räknas på hela ordern, även när skyltarna är olika", () => {
    const D = KALKYL;
    // 2 metall med nål och 2 plast med nål: 2 × 78 + 2 × 59 + 200 = 474 kr.
    assert.equal(orderShippingSek(D, [premium(2), premium(2, { signClass: "standard" })]), 75);
    // Med logga på plastskyltarna: 474 + 2 × 19 = 512 kr.
    assert.equal(orderShippingSek(D, [premium(2), premium(2, { signClass: "standard", extraEngraving: true })]), 159);
  });

  it("läggs på ordern efter minsta ordervärde: en ensam skylt kostar 299 kr plus 75 kr", () => {
    const order = priceItems([premium(1)], purchase);
    assert.equal(order.goodsSek, 299);
    assert.equal(order.shippingSek, 75);
    assert.equal(order.totalSek, 374);
  });

  it("ändrar inte priset per skylt eller varuvärdet", () => {
    const withShipping = priceItems([premium(10)], purchase);
    const without = priceItems([premium(10)], PURCHASE);
    assert.deepEqual(withShipping.unitSek, without.unitSek);
    assert.equal(withShipping.goodsSek, without.totalSek);
    assert.equal(withShipping.totalSek, 780 + 159);
  });

  it("provisionen räknas på varuvärdet, inte på frakten", () => {
    const order = priceItems([premium(10)], purchase);
    assert.deepEqual(provisionSplit(S, order.goodsSek, order.quantity), { provisionPercent: 15, provisionSek: 117, supplierSek: 663 });
  });

  it("kundens order har frakten i summan och i momsen", () => {
    const doc: BadgeDocument = { ...createBadgeDocument(["Anna Lind"]), quantity: 10 };
    const order = priceOrder([doc], list, orderShippingSek(S, [premium(10)]));
    assert.equal(order.shippingSek, 159);
    assert.equal(order.totalSek, 1300 + 159);
    assert.equal(order.totalInclVatSek, Math.round(1459 * 1.25));
    assert.equal(order.unitSek, 130);
  });

  it("en lista utan frakt, eller en tom order, har ingen frakt", () => {
    assert.equal(shippingSek(1000, PURCHASE), 0);
    assert.equal(shippingKind(1000, PURCHASE), null);
    assert.equal(orderShippingSek(M, [premium(10)]), 0);
    assert.equal(shippingSek(0, purchase), 0);
    assert.equal(priceItems([], purchase).totalSek, 0);
    assert.equal(orderShippingSek(S, []), 0);
    assert.equal(shippingSek(1000, { shipping: undefined }), 0);
  });

  it("modellen godtar bara hela kronor i frakten", () => {
    assert.equal(priceModelSchema.safeParse(S).success, true);
    assert.equal(priceModelSchema.safeParse({ ...S, shipping: { ...S.shipping, letterSek: 74.5 } }).success, false);
    assert.equal(priceModelSchema.safeParse({ ...S, shipping: { ...S.shipping, parcelSek: -1 } }).success, false);
  });
});

describe("en modell sparad i det äldre formatet", () => {
  /** Som modellen sparades på ordrar och offerter före startkostnaden. */
  const older = {
    tiers: M.tiers,
    signs: M.signs,
    options: { customShape: 19, extraEngraving: 19, pin: 5, clip: 9, magnet: 11 },
    minOrderSek: 299,
    endMarginPercent: 40,
    endMinOrderSek: 299,
  };

  it("läses som samma pris på alla trappsteg och ingen startkostnad, så att priserna står kvar", () => {
    const model = parseStoredPriceModel(JSON.parse(JSON.stringify(older)));
    assert.deepEqual(model, M);
    assert.equal(model?.startSek, 0);
    assert.deepEqual(model?.options.pin, [5, 5, 5, 5]);
  });

  it("en modell sparad före frakten läses utan frakt, så att ordrar och offerter behåller sina summor", () => {
    const beforeShipping: Record<string, unknown> = { ...KALKYL };
    delete beforeShipping.shipping;
    const model = parseStoredPriceModel(JSON.parse(JSON.stringify(beforeShipping)));
    assert.deepEqual(model?.shipping, NO_SHIPPING);
    assert.equal(model?.startSek, 200);
  });

  it("en modell i dagens format läses oförändrad", () => {
    assert.deepEqual(parseStoredPriceModel(JSON.parse(JSON.stringify(KALKYL))), KALKYL);
  });

  it("annat än en prismodell ger null", () => {
    for (const value of [null, undefined, "x", 7, [], {}, { ...older, tiers: [] }]) {
      assert.equal(parseStoredPriceModel(value), null);
    }
  });
});

describe("prislistorna håller isär parterna", () => {
  it("slutkundens lista innehåller varken inköpspriser, provision eller marginal", () => {
    const text = JSON.stringify(LIST);
    assert.deepEqual(Object.keys(LIST).sort(), ["minOrderSek", "options", "signs", "startSek", "tiers"]);
    assert.doesNotMatch(text, /provision|margin|reseller/i);
    // Inget av återförsäljarens skyltpriser står i kundens lista.
    for (const price of [...M.signs.premium, ...M.signs.standard]) {
      assert.ok(![...LIST.signs.premium, ...LIST.signs.standard].includes(price), `${price} kr läcker`);
    }
  });

  it("återförsäljarens lista innehåller sina inköpspriser men inte provisionen", () => {
    assert.deepEqual(PURCHASE.signs, M.signs);
    assert.equal(PURCHASE.minOrderSek, 299);
    assert.deepEqual(PURCHASE.tiers, [0, 100, 300, 500]);
    assert.doesNotMatch(JSON.stringify(PURCHASE), /provision|margin/i);
  });
});

describe("priceModelSchema", () => {
  it("godtar kalkylen och ett sparat utkast", () => {
    assert.equal(priceModelSchema.safeParse(M).success, true);
    assert.deepEqual(priceModelSchema.parse(JSON.parse(JSON.stringify(M))), M);
  });

  it("kräver stigande trappsteg som börjar på 0", () => {
    const tiers = (moreThan: number[]) => M.tiers.map((tier, i) => ({ ...tier, moreThan: moreThan[i] ?? 0 }));
    assert.equal(priceModelSchema.safeParse({ ...M, tiers: tiers([0, 100, 100, 500]) }).success, false);
    assert.equal(priceModelSchema.safeParse({ ...M, tiers: tiers([0, 300, 100, 500]) }).success, false);
    assert.equal(priceModelSchema.safeParse({ ...M, tiers: tiers([1, 100, 300, 500]) }).success, false);
    assert.equal(priceModelSchema.safeParse({ ...M, tiers: tiers([0, 50, 200, 1000]) }).success, true);
  });

  it("stoppar en marginal på 100 %, negativa belopp och fel antal trappsteg", () => {
    const model: PriceModel = M;
    assert.equal(priceModelSchema.safeParse({ ...model, endMarginPercent: 100 }).success, false);
    assert.equal(priceModelSchema.safeParse({ ...model, minOrderSek: -1 }).success, false);
    assert.equal(priceModelSchema.safeParse({ ...model, signs: { ...model.signs, premium: [73, 68, 64] } }).success, false);
  });

  it("godtar ören i återförsäljarens priser", () => {
    assert.equal(priceModelSchema.safeParse({ ...M, signs: { ...M.signs, premium: [73.5, 68, 64, 61] } }).success, true);
  });
});

describe("fraktsätt", () => {
  const list = resellerPriceTable(KALKYL);
  const four: PriceItem[] = [{ signClass: "premium", mounting: "pin", extraEngraving: false, customShape: false, quantity: 4 }];

  it("standardfrakten följer fraktregeln och listan är orörd", () => {
    assert.equal(withShippingMethod(list, "standard"), list);
    assert.equal(orderShippingSek(KALKYL, four), 159);
    assert.equal(orderShippingSek(KALKYL, four, "standard"), 159);
  });

  it("upphämtning och express har ingen frakt på ordern, och varorna kostar detsamma", () => {
    for (const method of ["pickup", "express"] as const) {
      const table = withShippingMethod(list, method);
      assert.equal("shipping" in table, false, method);
      assert.equal(priceItems(four, table).shippingSek, 0, method);
      assert.equal(priceItems(four, table).goodsSek, priceItems(four, list).goodsSek, method);
      assert.equal(priceItems(four, table).totalSek, priceItems(four, list).goodsSek, method);
      assert.equal(orderShippingSek(KALKYL, four, method), 0, method);
    }
    // Listan som skickades in ändras inte.
    assert.ok(list.shipping);
  });
});

describe("loggan ingår i skylten", () => {
  // Beslut av ägaren 2026-11-16: loggan kostar inget eget. Kombinerad märkning prissätts för sig.
  const included = { ...DEFAULT_PRICE_MODEL, shipping: NO_SHIPPING };
  const withLogo: BadgeDocument = {
    ...createBadgeDocument(["Anna Lind"]),
    quantity: 10,
    logo: { d: "M0 0L10 0L10 10L0 10Z", viewWidth: 10, viewHeight: 10, placement: "left", heightMm: 8 },
  };
  const withoutLogo: BadgeDocument = { ...withLogo };
  delete withoutLogo.logo;

  it("kalkylens pris för loggan är 0 kr på alla trappsteg", () => {
    assert.deepEqual(DEFAULT_PRICE_MODEL.options.extraEngraving, [0, 0, 0, 0]);
  });

  it("en skylt med logga kostar lika mycket som en utan, hos båda parter", () => {
    for (const table of [endPriceTable(included), resellerPriceTable(included)]) {
      assert.equal(priceOrder([withLogo], table, 0).totalSek, priceOrder([withoutLogo], table, 0).totalSek);
      assert.deepEqual(lineUnitPrices([withLogo], table), lineUnitPrices([withoutLogo], table));
    }
  });

  it("loggan har ingen egen rad i specifikationen när den ingår, men får en när ägaren sätter ett pris", () => {
    const parts = (model: typeof DEFAULT_PRICE_MODEL) => badgePriceParts(withLogo, 10, endPriceTable(model)).map((p) => p.part);
    assert.equal(parts(included).includes("extraEngraving"), false);
    assert.equal(parts({ ...KALKYL, shipping: NO_SHIPPING }).includes("extraEngraving"), true);
  });
});
