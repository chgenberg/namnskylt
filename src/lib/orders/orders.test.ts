import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createBadgeDocument, priceOrder, withTexts, type BadgeDocument } from "@/engine";
import { invoiceCsv, ordersCsv } from "./csv";
import { demoPlan } from "./demo-data";
import { DEMO_ORDERS } from "./demo-orders";
import { stepTimes, type StoredOrder } from "./model";
import { discountForUnits, isCustomPricing, priceWithPricing, pricingSchema, unitsForDiscount } from "./pricing";
import { repeatBadges, staffBadges } from "./repeat";
import { orderStats } from "./stats";

const plastic: BadgeDocument = { ...createBadgeDocument(["Anna Lind", "Säljare"]), materialId: "plastic-2-layer", colorId: "white-black" };

function order(patch: Partial<StoredOrder>): StoredOrder {
  return {
    id: "o1",
    orderNo: "NS-1",
    customer: { id: "c1", name: "Anna", company: "Kafé; Ett", email: "anna@example.se", phone: null, orgNumber: null, address: null, demo: false },
    status: "received",
    badges: [plastic],
    totalSek: 100,
    totalInclVatSek: 125,
    supplierOrderNo: null,
    partnerRequestNo: null,
    trackingUrl: null,
    source: "web",
    repeatOfOrderNo: null,
    placedAt: "2026-10-26T10:00:00Z",
    events: [],
    supplierSyncedAt: null,
    hasBadgeShot: false,
    shopSlug: null,
    project: null,
    resellerId: "namnskylt",
    pricing: null,
    demo: false,
    ...patch,
  };
}

describe("beställ igen", () => {
  it("kopierar skyltarna utan att dela objekt med originalet", () => {
    const original = [plastic];
    const again = repeatBadges(original);
    assert.deepEqual(again, original);
    assert.notEqual(again[0], original[0]);
  });

  it("ger en skylt per ny person med samma design", () => {
    const badges = staffBadges(plastic, "Erik Holm, Kock\n\nSara Ek, Servitör", 2);
    assert.equal(badges.length, 2);
    assert.deepEqual(
      badges.map((b) => b.rows.map((r) => r.text)),
      [
        ["Erik Holm", "Kock"],
        ["Sara Ek", "Servitör"],
      ],
    );
    assert.ok(badges.every((b) => b.quantity === 2 && b.materialId === plastic.materialId));
  });
});

describe("statistik", () => {
  const now = new Date("2026-10-27T12:00:00Z");
  const orders = [
    order({ id: "a", placedAt: "2026-10-26T10:00:00Z", totalSek: 300 }),
    order({ id: "b", placedAt: "2026-10-20T10:00:00Z", totalSek: 100 }),
    order({ id: "c", customer: { id: "c2", name: "Bo", company: null, email: "bo@x.se", phone: null, orgNumber: null, address: null, demo: false }, totalSek: 200 }),
    order({ id: "d", status: "cancelled", totalSek: 9999 }),
  ];
  const stats = orderStats(orders, now, 4);

  it("räknar inte avbrutna ordrar", () => {
    assert.equal(stats.orderCount, 3);
    assert.equal(stats.revenueSek, 600);
    assert.equal(stats.averageOrderSek, 200);
  });

  it("lägger ordrarna i rätt vecka, nyaste sist", () => {
    assert.equal(stats.weeks.length, 4);
    assert.equal(stats.weeks.at(-1)?.weekStart, "2026-10-26");
    assert.equal(stats.weeks.at(-1)?.label, "v.44");
    assert.equal(stats.weeks.at(-1)?.revenueSek, 500);
    assert.equal(stats.weeks.at(-2)?.revenueSek, 100);
  });

  it("räknar andelen återkommande kunder", () => {
    assert.equal(stats.customers, 2);
    assert.equal(stats.repeatCustomerShare, 0.5);
    assert.equal(stats.materials[0]?.materialId, "plastic-2-layer");
  });
});

describe("export", () => {
  it("skriver svensk CSV med BOM, semikolon och citerade fält", () => {
    const csv = ordersCsv([order({})]);
    assert.ok(csv.startsWith("\uFEFFOrder;Datum;"));
    assert.match(csv, /"Kafé; Ett"/);
    assert.match(csv, /;Mottagen;1;100;125;/);
  });

  it("ger en fakturarad per skylt och hoppar över avbrutna", () => {
    const two = order({ badges: [plastic, { ...withTexts(plastic, ["Bo"]), quantity: 3 }] });
    const lines = invoiceCsv([two, order({ status: "cancelled" })]).trim().split("\r\n");
    assert.equal(lines.length, 3);
    assert.match(lines[1] ?? "", /Namnskylt: Anna Lind \/ Säljare/);
    assert.match(lines[2] ?? "", /;3;/);
  });
});

describe("egna priser", () => {
  const badges = [
    { ...plastic, quantity: 2 },
    { ...withTexts(plastic, ["Bo"]), quantity: 3 },
  ];

  it("utan prissättning blir det listpris, samma som motorn", () => {
    const priced = priceWithPricing(badges);
    assert.equal(priced.totalSek, priceOrder(badges).totalSek);
    assert.equal(priced.discountSek, 0);
    assert.ok(priced.lines.every((l) => !l.overridden));
  });

  it("à-pris per skylt och rabatt på summan", () => {
    const priced = priceWithPricing(badges, { unitOverrides: [50, null], discountPercent: 10, extras: [] });
    const second = priced.lines[1];
    assert.ok(second);
    assert.equal(priced.lines[0]?.totalSek, 100);
    assert.equal(priced.subtotalSek, 100 + second.listUnitSek * 3);
    assert.equal(priced.discountSek, Math.round(priced.subtotalSek * 0.1));
    assert.equal(priced.totalSek, priced.subtotalSek - priced.discountSek);
    assert.equal(priced.totalInclVatSek, priced.totalSek + Math.round(priced.totalSek * 0.25));
    assert.equal(priced.lines[0]?.overridden, true);
  });

  it("sparar bara prissättning som avviker", () => {
    assert.equal(isCustomPricing({ unitOverrides: [null, null], discountPercent: 0, extras: [] }), false);
    assert.equal(isCustomPricing({ unitOverrides: [], discountPercent: 5, extras: [] }), true);
    assert.equal(isCustomPricing({ unitOverrides: [], discountPercent: 0, extras: [{ label: "Express", amountSek: 300 }] }), true);
  });

  it("extra kostnader läggs på efter rabatten och momsas", () => {
    const priced = priceWithPricing(badges, {
      unitOverrides: [],
      discountPercent: 0,
      extras: [
        { label: "Framtagning av korrektur", amountSek: 250 },
        { label: "Expressorder", amountSek: 300 },
      ],
    });
    assert.equal(priced.extrasSek, 550);
    assert.equal(priced.totalSek, priced.badgesSek + 550);
    assert.equal(priced.totalInclVatSek, priced.totalSek + Math.round(priced.totalSek * 0.25));
  });

  it("rabatten och à-priserna följer varandra", () => {
    const list = [164, 100];
    const units = unitsForDiscount(list, 10);
    assert.deepEqual(units, [148, 90]);
    assert.equal(discountForUnits(list, [131, 100], [1, 1]), 12.5);
    assert.equal(discountForUnits(list, list, [1, 1]), 0);
    const priced = priceWithPricing(badges, { unitOverrides: [40, null], discountPercent: 0, extras: [] });
    assert.equal(priced.savingsSek, priced.listTotalSek - priced.badgesSek);
  });

  it("äldre sparade priser utan extrarader läses in", () => {
    assert.deepEqual(pricingSchema.parse({ unitOverrides: [10], discountPercent: 0 }).extras, []);
  });
});

describe("demodata", () => {
  it("räknar datumen från nu, så att demon alltid ser aktuell ut", () => {
    const now = new Date("2027-03-01T12:00:00Z");
    const plan = demoPlan(now);
    const newest = Math.max(...plan.map((o) => Date.parse(o.placedAt)));
    assert.ok(newest <= now.getTime() && now.getTime() - newest < 24 * 60 * 60 * 1000);
    assert.ok(plan.length > DEMO_ORDERS.length, "några kunder har beställt förut");
    assert.ok(plan.every((o) => o.email.endsWith("@example.se")));
  });
});

describe("tidslinje", () => {
  it("tar senaste tiden per status", () => {
    const times = stepTimes([
      { status: "received", note: null, at: "1" },
      { status: "shipped", note: null, at: "2" },
      { status: "received", note: null, at: "3" },
    ]);
    assert.deepEqual(times, { received: "3", shipped: "2" });
  });
});
