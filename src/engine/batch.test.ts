import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  badgeDocumentSchema,
  badgeGroups,
  batchLine,
  createBadgeDocument,
  groupBadges,
  groupQuantity,
  isBlankBadge,
  MAX_ORDER_BADGES,
  parseBatchInput,
  priceBadge,
  priceOrder,
  quantityForNames,
  removeBatchEntry,
  replaceBatchEntry,
  sameDesign,
  withLeadName,
  withTexts,
  type BadgeDocument,
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

describe("antalet per namn när namnlistan ändras", () => {
  it("blir 1 när listan får sina första namn: 10 skyltar och 10 namn ska inte bli 100", () => {
    assert.equal(quantityForNames(10, "", "Anna Lind, Säljare\nErik Holm, VD"), 1);
    // Tomma rader är ingen lista än.
    assert.equal(quantityForNames(10, " \n", "Anna Lind"), 1);
    assert.equal(quantityForNames(10, "", " \n\t"), 10);
  });

  it("står kvar när kunden sedan lägger till, ändrar eller tar bort namn", () => {
    // Kunden har valt 3 per namn. Fler namn, från tangentbordet eller en fil till, ändrar inte det.
    assert.equal(quantityForNames(3, "Anna Lind", "Anna Lind\nErik Holm"), 3);
    assert.equal(quantityForNames(3, "Anna Lind\nErik Holm", "Anna Lind"), 3);
    assert.equal(quantityForNames(3, "Anna Lind", ""), 3);
    assert.equal(quantityForNames(1, "", "Anna Lind"), 1);
  });
});

describe("en helt tom skylt", () => {
  it("är bara den som varken har text eller logga: bara den får platshållare i ritningen", () => {
    const logo = { d: "M0 0L1 0L1 1Z", viewWidth: 1, viewHeight: 1, placement: "left" as const, heightMm: 10 };
    assert.equal(isBlankBadge(createBadgeDocument([""])), true);
    assert.equal(isBlankBadge(createBadgeDocument(["", " "])), true);
    // En skylt med bara logga är en skylt utan namn, och en tom rad bredvid ett namn är en rad utan text.
    assert.equal(isBlankBadge({ ...createBadgeDocument([""]), logo }), false);
    assert.equal(isBlankBadge(createBadgeDocument(["Anna Lind", ""])), false);
  });
});

describe("en skylt utan text med namn i listan", () => {
  const logo = { d: "M0 0L1 0L1 1Z", viewWidth: 1, viewHeight: 1, placement: "left" as const, heightMm: 10 };

  it("listans första namn tar skyltens plats, så att ingen skylt utan text följer med namnen", () => {
    const group = withLeadName({ doc: { ...createBadgeDocument([""]), logo }, batchText: "\nAnna Lind, Säljare\nErik Holm, VD" });
    assert.equal(batchLine(group.doc), "Anna Lind, Säljare");
    assert.deepEqual(group.doc.logo, logo);
    assert.deepEqual(parseBatchInput(group.batchText), [["Erik Holm", "VD"]]);
    assert.equal(groupBadges(group).length, 2);
  });

  it("en skylt med text, eller en skylt med bara logga utan lista, står som den är", () => {
    const named = { doc: createBadgeDocument(["Anna Lind"]), batchText: "Erik Holm" };
    assert.equal(withLeadName(named), named);
    const only = { doc: { ...createBadgeDocument([""]), logo }, batchText: " \n" };
    assert.equal(withLeadName(only), only);
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

  it("hänvisningen till loggans originalfil hör inte till designen", () => {
    const logo = { d: "M0 0L10 0L10 10L0 10Z", viewWidth: 10, viewHeight: 10, placement: "left" as const, heightMm: 10 };
    const plain = { ...doc, logo };
    const pointed = { ...doc, logo: { ...logo, originalId: "ab".repeat(32) } };
    assert.equal(sameDesign([plain, pointed]), true);
    assert.equal(sameDesign([pointed, { ...pointed, logo: { ...pointed.logo, heightMm: 12 } }]), false);
    // Jämförelsen ändrar inte skylten.
    assert.equal(pointed.logo.originalId, "ab".repeat(32));
  });

  it("en annan yta, form eller ett annat fäste är en annan design", () => {
    assert.equal(sameDesign([doc, { ...doc, colorId: "metal-silver" }]), false);
    assert.equal(sameDesign([doc, { ...doc, mounting: "magnet" }]), false);
    assert.equal(sameDesign([doc, { ...doc, materialId: "plastic", colorId: "white-black" }]), false);
  });
});

describe("badgeGroups", () => {
  const anna = { ...createBadgeDocument(["Anna Lind", "Säljare"]), quantity: 2 };
  const erik = withTexts(anna, ["Erik Berg", "Tekniker"]);
  const sara = withTexts(anna, ["Sara Nilsson"]);
  const plain = (docs: readonly BadgeDocument[]) => docs.map((doc) => ({ ...doc, rows: doc.rows.map((row) => ({ ...row, id: "" })) }));

  it("samlar skyltar som bara skiljer i namn till en design med sina namn", () => {
    const groups = badgeGroups([anna, erik, sara]);
    assert.equal(groups.length, 1);
    assert.equal(groups[0]?.doc, anna);
    assert.equal(groups[0]?.batchText, "Erik Berg, Tekniker\nSara Nilsson");
  });

  it("ger alltid tillbaka exakt samma skyltar", () => {
    const other = { ...withTexts(anna, ["Olle Ek"]), mounting: "magnet" as const };
    const five = { ...withTexts(anna, ["Mia Sol"]), quantity: 5 };
    const badges = [anna, erik, other, five, sara];
    const groups = badgeGroups(badges);
    // En annan design och ett annat antal börjar var sin grupp, och skylten efter hamnar hos den närmast före.
    assert.deepEqual(groups.map((group) => groupBadges(group).length), [2, 1, 1, 1]);
    assert.deepEqual(plain(groups.flatMap((group) => groupBadges(group))), plain(badges));
  });

  it("låter en skylt som inte går att skriva som en rad stå för sig", () => {
    const empty = withTexts(anna, [""]);
    const dashed = withTexts(anna, ["Wilma – Barista"]);
    const bold = { ...erik, rows: erik.rows.map((row, i) => (i === 0 ? { ...row, bold: !row.bold } : row)) };
    for (const odd of [empty, dashed, bold]) {
      const groups = badgeGroups([anna, odd]);
      assert.equal(groups.length, 2);
      assert.deepEqual(plain(groups.flatMap((group) => groupBadges(group))), plain([anna, odd]));
    }
  });

  it("en tom order ger inga grupper", () => {
    assert.deepEqual(badgeGroups([]), []);
  });
});
