import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createBadgeDocument, NO_SHIPPING, type BadgeDocument } from "@/engine";
import { DEFAULT_PRICE_MODEL } from "@/engine/default-price-model";
import type { PriceModel } from "@/engine/price-model";
import { inPeriod, orderShare, periodLabel, periodOf, periodsOf, provisionCsv, sumShares, totalsByReseller, type ResellerOrderRow } from "./provision";

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
    const withShipping = orderShare(badges(10), { ...M, shipping: DEFAULT_PRICE_MODEL.shipping });
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
      share: orderShare(badges(10), { ...M, shipping: DEFAULT_PRICE_MODEL.shipping }),
    };
    const lines = provisionCsv([withShipping]).replace("\uFEFF", "").trim().split("\r\n");
    assert.equal(lines.length, 2);
    assert.equal(lines[0]?.split(";").length, 12);
    assert.deepEqual(lines[1]?.split(";"), ["NS-alfa-10", "2026-11-13", "Mottagen", "ALFA", "Kafé Ett", "10", "780", "159", "15", "117", "663", "822"]);
  });
});
