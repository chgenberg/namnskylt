import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createBadgeDocument, NO_SHIPPING, type BadgeDocument } from "@/engine";
import { DEFAULT_PRICE_MODEL } from "@/engine/default-price-model";
import { TIERED_SHIPPING } from "@/engine/testing";
import type { PriceModel } from "@/engine/price-model";
import {
  DIRECT_SELLER_NAME,
  directOrderShare,
  exampleResellerOrders,
  inPeriod,
  orderShare,
  periodLabel,
  periodOf,
  periodsOf,
  provisionCsv,
  sumShares,
  totalsByReseller,
  type ResellerOrderRow,
} from "./provision";

/** Kalkylens siffror utan startkostnad: reglerna här prövas var för sig, och startkostnaden har egna tester. */
const M: PriceModel = { ...DEFAULT_PRICE_MODEL, startSek: 0, shipping: NO_SHIPPING };
/** Metallskylt (Premium) med nål: 73 + 5 kr på första trappsteget. */
const badges = (quantity: number): BadgeDocument[] => [{ ...createBadgeDocument(["Anna Lind"]), quantity }];

function row(resellerId: string, quantity: number, customerSek: number): ResellerOrderRow {
  return {
    orderNo: `NS-${resellerId}-${quantity}`,
    placedAt: "2026-11-13T10:00:00.000Z",
    status: "received",
    resellerId,
    resellerName: resellerId.toUpperCase(),
    customer: "Kafé Ett",
    customerSek,
    share: orderShare(badges(quantity), M),
  };
}

describe("fördelningen av en återförsäljares order", () => {
  it("10 skyltar: återförsäljaren betalar 780 kr, 15 % är provision och resten går till verkstaden", () => {
    assert.deepEqual(orderShare(badges(10), M), {
      quantity: 10,
      resellerSek: 780,
      shippingSek: 0,
      provisionPercent: 15,
      provisionSek: 117,
      supplierSek: 663,
    });
  });

  it("en ensam skylt: provisionen räknas på minsta ordervärde, 299 kr", () => {
    const share = orderShare(badges(1), M);
    assert.equal(share.resellerSek, 299);
    assert.equal(share.provisionSek, 44.85);
    assert.equal(share.supplierSek, 254.15);
  });

  it("provisionen räknas steg för steg: 150 skyltar är 100 st à 15 % och 50 st à 12 %, alltså 14 % på ordern", () => {
    const share = orderShare(badges(150), M);
    assert.equal(share.resellerSek, 150 * (68 + 5));
    assert.equal(share.provisionPercent, 14);
    assert.equal(share.provisionSek, 1533);
    assert.equal(share.provisionSek + share.supplierSek, share.resellerSek);
  });

  it("skylt 101 sänker inte provisionen på de första 100: 7 373 kr ger 1 103,76 kr, inte 884,76 kr", () => {
    const share = orderShare(badges(101), M);
    assert.equal(share.resellerSek, 101 * (68 + 5));
    assert.equal(share.provisionSek, 1103.76);
    assert.equal(share.supplierSek, 6269.24);
  });

  it("frakten har ingen provision: 10 skyltar med 159 kr frakt ger samma 117 kr som utan", () => {
    const withShipping = orderShare(badges(10), { ...M, shipping: TIERED_SHIPPING });
    assert.equal(withShipping.resellerSek, 780);
    assert.equal(withShipping.shippingSek, 159);
    assert.equal(withShipping.provisionSek, 117);
    assert.equal(withShipping.supplierSek, 663);
  });

  it("räknar med modellen ordern sparades med", () => {
    const older: PriceModel = { ...M, tiers: M.tiers.map((tier) => ({ ...tier, provisionPercent: 25 })) };
    assert.equal(orderShare(badges(10), older).provisionSek, 195);
  });
});

describe("fördelningen av en direktorder hos namnskylt.com", () => {
  it("10 skyltar: verkstaden fakturerar kunden 1 300 kr, 40 % är plattformens och verkstaden får inköpsvärdet", () => {
    // Kundens pris är inköpspriset delat med 0,6, avrundat per del: 122 + 8 kr per skylt.
    assert.deepEqual(directOrderShare(badges(10), null, M), {
      quantity: 10,
      resellerSek: 1300,
      shippingSek: 0,
      provisionPercent: 40,
      provisionSek: 520,
      supplierSek: 780,
    });
    // Samma order via en återförsäljare ger verkstaden mindre: där dras trappstegens provision från inköpsvärdet.
    assert.equal(orderShare(badges(10), M).supplierSek, 663);
  });

  it("en ensam skylt: provisionen räknas på kundens minsta ordervärde", () => {
    const share = directOrderShare(badges(1), null, M);
    assert.equal(share.resellerSek, M.endMinOrderSek);
    assert.equal(share.provisionSek, Math.round(M.endMinOrderSek * 40) / 100);
    assert.equal(Math.round((share.provisionSek + share.supplierSek) * 100) / 100, share.resellerSek);
  });

  it("procenten är prismodellens marginal, och egna à-priser ändrar beloppet den räknas på", () => {
    assert.equal(directOrderShare(badges(10), null, { ...M, endMarginPercent: 30 }).provisionPercent, 30);
    const priced = directOrderShare(badges(10), { unitOverrides: [100], discountPercent: 0, extras: [] }, M);
    assert.deepEqual([priced.resellerSek, priced.provisionSek, priced.supplierSek], [1000, 400, 600]);
  });

  it("frakten har ingen provision och är densamma som via en återförsäljare", () => {
    const withShipping = { ...M, shipping: TIERED_SHIPPING };
    const share = directOrderShare(badges(10), null, withShipping);
    assert.equal(share.shippingSek, orderShare(badges(10), withShipping).shippingSek);
    assert.equal(share.provisionSek, 520);
    assert.equal(directOrderShare(badges(10), null, withShipping, "pickup").shippingSek, 0);
    assert.equal(directOrderShare(badges(10), null, withShipping, "express", 249).shippingSek, 249);
  });

  it("exemplen på provisionssidan visar båda slagen av order", () => {
    const examples = exampleResellerOrders({ ...DEFAULT_PRICE_MODEL, shipping: TIERED_SHIPPING }, new Date("2026-11-17T10:00:00Z"));
    const directRows = examples.filter((example) => example.resellerName === DIRECT_SELLER_NAME);
    assert.equal(directRows.length, 2);
    assert.ok(directRows.every((example) => example.share.provisionPercent === 40));
    assert.ok(examples.some((example) => example.share.provisionPercent === 15));
  });
});

describe("fraktsättet i fördelningen", () => {
  const withShipping: PriceModel = { ...M, shipping: TIERED_SHIPPING };

  it("upphämtning och express har ingen frakt, och provisionen är densamma", () => {
    const standard = orderShare(badges(10), withShipping);
    assert.equal(standard.shippingSek, 159);
    for (const method of ["pickup", "express"] as const) {
      assert.deepEqual(orderShare(badges(10), withShipping, method), { ...standard, shippingSek: 0 }, method);
    }
  });
});

describe("summor", () => {
  const rows = [row("alfa", 10, 1300), row("beta", 150, 18000), row("alfa", 1, 299)];

  it("summerar ordrar, skyltar och varje parts belopp", () => {
    const total = sumShares(rows);
    assert.equal(total.orders, 3);
    assert.equal(total.quantity, 161);
    assert.equal(total.customerSek, 19599);
    assert.equal(total.resellerSek, 780 + 10950 + 299);
    assert.equal(total.provisionSek, 1694.85);
    assert.equal(total.supplierSek, 10334.15);
  });

  it("grupperar per återförsäljare med störst provision först", () => {
    const groups = totalsByReseller(rows);
    assert.deepEqual(
      groups.map((g) => [g.resellerId, g.orders, g.provisionSek]),
      [
        ["beta", 1, 1533],
        ["alfa", 2, 161.85],
      ],
    );
  });

  it("ingenting att summera ger nollor", () => {
    assert.deepEqual(sumShares([]), {
      orders: 0,
      quantity: 0,
      customerSek: 0,
      resellerSek: 0,
      shippingSek: 0,
      provisionSek: 0,
      supplierSek: 0,
    });
    assert.deepEqual(totalsByReseller([]), []);
  });
});

describe("perioder", () => {
  const at = (placedAt: string, quantity = 10): ResellerOrderRow => ({ ...row("alfa", quantity, 1300), placedAt });

  it("en order hör till månaden den lades i svensk tid, även strax efter midnatt", () => {
    assert.equal(periodOf("2026-11-13T10:00:00.000Z"), "2026-11");
    // 23:30 UTC den 30 november är 00:30 den 1 december i Sverige.
    assert.equal(periodOf("2026-11-30T23:30:00.000Z"), "2026-12");
    assert.equal(periodLabel("2026-11"), "november 2026");
  });

  it("månaderna listas nyast först och en vald månad ger bara sina ordrar", () => {
    const rows = [at("2026-10-05T10:00:00.000Z"), at("2026-11-13T10:00:00.000Z"), at("2026-11-20T10:00:00.000Z")];
    assert.deepEqual(periodsOf(rows), ["2026-11", "2026-10"]);
    assert.equal(inPeriod(rows, "2026-11").length, 2);
    assert.equal(inPeriod(rows, "2026-09").length, 0);
    assert.equal(inPeriod(rows, null).length, 3);
  });

  it("underlaget har en rad per order med varor, frakt, provision och verkstadens del", () => {
    const withShipping: ResellerOrderRow = {
      ...at("2026-11-13T10:00:00.000Z"),
      share: orderShare(badges(10), { ...M, shipping: TIERED_SHIPPING }),
    };
    const lines = provisionCsv([withShipping]).replace("\uFEFF", "").trim().split("\r\n");
    assert.equal(lines.length, 2);
    assert.equal(lines[0]?.split(";").length, 12);
    assert.deepEqual(lines[1]?.split(";"), ["NS-alfa-10", "2026-11-13", "Mottagen", "ALFA", "Kafé Ett", "10", "780", "159", "15", "117", "663", "822"]);
  });
});

describe("exempelordrarna på sidan Provision", () => {
  const rows = exampleResellerOrders({ ...DEFAULT_PRICE_MODEL, shipping: TIERED_SHIPPING }, new Date("2026-11-15T12:00:00.000Z"));
  const share = (orderNo: string) => rows.find((row) => row.orderNo === orderNo)?.share;

  it("har egna ordernummer och påhittade namn, så att de inte går att ta för riktiga", () => {
    assert.ok(rows.length > 0);
    assert.ok(rows.every((row) => /^EX-\d{4}$/.test(row.orderNo)));
    assert.equal(new Set(rows.map((row) => row.orderNo)).size, rows.length);
    // Återförsäljarna är påhittade. Direktordrarna säljs av namnskylt.com självt, men kunderna är påhittade även där.
    assert.ok(rows.every((row) => row.resellerName.startsWith("Exempel ") || row.resellerName === DIRECT_SELLER_NAME));
    assert.ok(rows.every((row) => row.customer.startsWith("Exempelkund ")));
  });

  it("25 skyltar räknas som i prismodellens kalkyl: 2 150 kr, 322,50 kr i provision och 1 827,50 kr till verkstaden", () => {
    assert.deepEqual(share("EX-1003"), {
      quantity: 25,
      resellerSek: 2150,
      shippingSek: 159,
      provisionPercent: 15,
      provisionSek: 322.5,
      supplierSek: 1827.5,
    });
    // Kunden betalar 143 kr per skylt och samma frakt som återförsäljaren.
    assert.equal(rows.find((row) => row.orderNo === "EX-1003")?.customerSek, 25 * 143 + 159);
  });

  it("en ensam skylt når minsta ordervärde och går som varubrev", () => {
    assert.equal(share("EX-1001")?.resellerSek, 299);
    assert.equal(share("EX-1001")?.shippingSek, 75);
  });

  it("350 skyltar får provisionen steg för steg, 12,57 % på hela ordern", () => {
    assert.equal(Math.round((share("EX-1005")?.provisionPercent ?? 0) * 100) / 100, 12.57);
  });

  it("ligger i två månader, så att periodfiltret går att prova", () => {
    assert.deepEqual(periodsOf(rows), ["2026-11", "2026-10"]);
  });
});
