import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  badgeDocumentSchema,
  batchLine,
  createBadgeDocument,
  parseBatchInput,
  priceBadge,
  priceOrder,
  removeBatchEntry,
  replaceBatchEntry,
  withTexts,
} from "./index";

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

describe("priceOrder", () => {
  it("ger mängdrabatt på orderns totala antal, även för olika namn", () => {
    const template = createBadgeDocument(["Anna"]);
    const names = Array.from({ length: 12 }, (_, i) => withTexts(template, [`Person ${i}`]));
    const order = priceOrder(names);
    assert.equal(order.quantity, 12);
    assert.equal(order.tier.minQuantity, 10);
    assert.ok(order.unitSek < priceBadge(template).unitSek);
  });

  it("stämmer med priceBadge för en enda rad", () => {
    const doc = { ...createBadgeDocument(["Anna"]), quantity: 250 };
    assert.deepEqual(priceOrder([doc]), priceBadge(doc));
  });
});
