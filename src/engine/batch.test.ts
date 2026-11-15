import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  badgeDocumentSchema,
  batchLine,
  createBadgeDocument,
  groupBadges,
  groupQuantity,
  MAX_ORDER_BADGES,
  parseBatchInput,
  priceBadge,
  priceOrder,
  removeBatchEntry,
  replaceBatchEntry,
  sameDesign,
  withTexts,
} from "./index";
import { endPriceTable } from "./price-model";
import { DEFAULT_PRICE_MODEL } from "./default-price-model";

describe("parseBatchInput", () => {
  it("ger en skylt per rad och hoppar över tomma rader", () => {
    assert.deepEqual(parseBatchInput("Anna Lindqvist, Projektledare\n\n  \nErik Holm | Överläkare\r\nWilma"), [
      ["Anna Lindqvist", "Projektledare"],
      ["Erik Holm", "Överläkare"],
      ["Wilma"],
    ]);
  });

  it("tolkar kolumner inklistrade från Excel som namn och titel", () => {
    assert.deepEqual(parseBatchInput("Åsa Öberg\tSäljchef"), [["Åsa Öberg", "Säljchef"]]);
  });

  it("begränsar antalet skyltar", () => {
    assert.equal(parseBatchInput("a\nb\nc", 2).length, 2);
  });

  it("tar bort rätt skylt även när det finns tomma rader emellan", () => {
    assert.equal(removeBatchEntry("Anna\n\nErik, VD\nWilma", 1), "Anna\n\nWilma");
  });

  it("byter text på rätt skylt och lämnar resten orört", () => {
    assert.equal(replaceBatchEntry("Anna\n\nErik, VD\nWilma", 1, "Pär, Lager"), "Anna\n\nPär, Lager\nWilma");
    assert.deepEqual(parseBatchInput(replaceBatchEntry("Anna\nErik", 0, "Bo, VD")), [["Bo", "VD"], ["Erik"]]);
  });
});

describe("withTexts", () => {
  const template = {
    ...createBadgeDocument(["Anna Lindqvist", "Projektledare"]),
    materialId: "aluminium-anodized" as const,
    colorId: "alu-natural-black",
    quantity: 3,
  };

  it("behåller designen och radernas stil men byter text", () => {
    const doc = withTexts(template, ["Erik Holm", "Överläkare"]);
    assert.equal(doc.materialId, template.materialId);
    assert.equal(doc.quantity, 3);
    assert.deepEqual(
      doc.rows.map((r) => [r.text, r.capHeightMm, r.bold]),
      template.rows.map((r, i) => [["Erik Holm", "Överläkare"][i], r.capHeightMm, r.bold]),
    );
  });

  it("lägger till och tar bort rader efter behov", () => {
    assert.equal(withTexts(template, ["Wilma"]).rows.length, 1);
    assert.equal(withTexts(template, ["Marcus Holm", "VD", "Nordbygg AB"]).rows.length, 3);
  });

  it("ger giltiga dokument som går att läsa tillbaka till samma rad", () => {
    const doc = withTexts(template, ["Erik Holm", "Överläkare"]);
    assert.equal(badgeDocumentSchema.safeParse(doc).success, true);
    assert.deepEqual(parseBatchInput(batchLine(doc)), [["Erik Holm", "Överläkare"]]);
  });
});

const LIST = endPriceTable(DEFAULT_PRICE_MODEL);

describe("priceOrder", () => {
  it("ger lägre pris på orderns totala antal, även för olika namn", () => {
    const template = createBadgeDocument(["Anna"]);
    const names = Array.from({ length: 120 }, (_, i) => withTexts(template, [`Person ${i}`]));
    const order = priceOrder(names, LIST, 0);
    assert.equal(order.quantity, 120);
    assert.equal(order.tierIndex, 1);
    assert.ok(order.unitSek < priceBadge({ ...template, quantity: 10 }, LIST).unitSek);
  });

  it("stämmer med priceBadge för en enda rad", () => {
    const doc = { ...createBadgeDocument(["Anna"]), quantity: 250 };
    assert.deepEqual(priceOrder([doc], LIST, 0), priceBadge(doc, LIST));
  });
});

describe("en design med sina namn", () => {
  const doc = { ...createBadgeDocument(["Anna Lind", "Säljare"]), quantity: 2 };

  it("ger skylten i editorn först och sedan en skylt per rad, alla med samma design", () => {
    const badges = groupBadges({ doc, batchText: "Bo Ek, Kock\n\nCia Dal" });
    assert.equal(badges.length, 3);
    assert.equal(badges[0], doc);
    assert.deepEqual(badges.map((badge) => badge.rows[0]?.text), ["Anna Lind", "Bo Ek", "Cia Dal"]);
    assert.ok(badges.every((badge) => badge.materialId === doc.materialId && badge.quantity === 2));
  });

  it("räknar alla namn gånger antalet per namn", () => {
    assert.equal(groupQuantity({ doc, batchText: "Bo Ek\nCia Dal" }), 6);
    assert.equal(groupQuantity({ doc, batchText: "" }), 2);
  });

  it("håller sig inom det som får plats i ordern", () => {
    const many = Array.from({ length: 150 }, (_, i) => `Person ${i + 1}`).join("\n");
    assert.equal(groupBadges({ doc, batchText: many }).length, MAX_ORDER_BADGES);
    assert.equal(groupBadges({ doc, batchText: many }, 10).length, 10);
    assert.deepEqual(groupBadges({ doc, batchText: many }, 0), []);
  });
});

describe("samma design", () => {
  const doc = createBadgeDocument(["Anna Lind", "Säljare"]);

  it("skyltar som bara skiljer i namn, antal rader och antal har samma design", () => {
    const group = groupBadges({ doc, batchText: "Bo Ek\nCia Dal, Kock" });
    assert.equal(sameDesign([...group, { ...doc, quantity: 7 }]), true);
    assert.equal(sameDesign([doc]), true);
    assert.equal(sameDesign([]), true);
  });

  it("en annan yta, form eller ett annat fäste är en annan design", () => {
    assert.equal(sameDesign([doc, { ...doc, colorId: "metal-silver" }]), false);
    assert.equal(sameDesign([doc, { ...doc, mounting: "magnet" }]), false);
    assert.equal(sameDesign([doc, { ...doc, materialId: "plastic", colorId: "white-black" }]), false);
  });
});
