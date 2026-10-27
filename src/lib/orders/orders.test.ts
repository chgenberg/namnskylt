import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createBadgeDocument, withTexts, type BadgeDocument } from "@/engine";
import { invoiceCsv, ordersCsv } from "./csv";
import { stepTimes, type StoredOrder } from "./model";
import { repeatBadges, staffBadges } from "./repeat";
import { orderStats } from "./stats";

const plastic: BadgeDocument = { ...createBadgeDocument(["Anna Lind", "Säljare"]), materialId: "plastic-2-layer", colorId: "white-black" };

function order(patch: Partial<StoredOrder>): StoredOrder {
  return {
    id: "o1",
    orderNo: "NS-1",
    customer: { id: "c1", name: "Anna", company: "Kafé; Ett", email: "anna@example.se" },
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
    order({ id: "c", customer: { id: "c2", name: "Bo", company: null, email: "bo@x.se" }, totalSek: 200 }),
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
