import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  approxMeasure,
  badgeDocumentSchema,
  createBadgeDocument,
  layoutBadge,
  parseSmartInput,
  priceBadge,
  renderBadgeSvg,
} from "./index";

describe("parseSmartInput", () => {
  it("delar på komma, pipe och streck med mellanslag", () => {
    assert.deepEqual(parseSmartInput("Anna Lindqvist, Projektledare"), ["Anna Lindqvist", "Projektledare"]);
    assert.deepEqual(parseSmartInput("Erik Holm | Överläkare | Avd 4"), ["Erik Holm", "Överläkare", "Avd 4"]);
    assert.deepEqual(parseSmartInput("Wilma – Barista"), ["Wilma", "Barista"]);
  });

  it("delar inte dubbelnamn med bindestreck", () => {
    assert.deepEqual(parseSmartInput("Lars-Erik Ek"), ["Lars-Erik Ek"]);
  });

  it("tar högst tre rader och tvättar mellanslag", () => {
    assert.deepEqual(parseSmartInput("  a ,b,  c ,d "), ["a", "b", "c"]);
  });
});

describe("layoutBadge", () => {
  it("centrerar en kort rad utan att krympa den", () => {
    const doc = createBadgeDocument(["Anna"]);
    const layout = layoutBadge(doc, approxMeasure);
    const row = layout.rows[0]!;
    assert.equal(row.xMm, doc.size.widthMm / 2);
    assert.equal(row.capHeightMm, doc.rows[0]!.capHeightMm);
    assert.deepEqual(layout.issues, []);
  });

  it("krymper en lång rad så den ryms inom säkerhetszonen", () => {
    const doc = createBadgeDocument(["Maximiliana Lindqvist-Östergren"]);
    const layout = layoutBadge(doc, approxMeasure);
    const row = layout.rows[0]!;
    assert.ok(row.widthMm <= doc.size.widthMm - 2 * layout.contentInsetMm + 1e-6);
    assert.equal(layout.issues[0]?.code, "row-shrunk");
  });

  it("ger ovalen smalare textyta än en rak skylt", () => {
    const text = ["Anna Lindqvist", "Projektledare", "Avdelningen för kvalitet"];
    const rect = layoutBadge({ ...createBadgeDocument(text), shape: "rectangle" }, approxMeasure);
    const oval = layoutBadge({ ...createBadgeDocument(text), shape: "oval" }, approxMeasure);
    assert.ok(oval.rows[2]!.capHeightMm < rect.rows[2]!.capHeightMm);
  });

  it("håller textblocket inom höjden", () => {
    const doc = createBadgeDocument(["A", "B", "C"]);
    doc.rows.forEach((r) => (r.capHeightMm = 12));
    const layout = layoutBadge(doc, approxMeasure);
    assert.ok(layout.rows[0]!.baselineMm - layout.rows[0]!.capHeightMm >= layout.contentInsetMm - 1e-6);
    assert.ok(layout.rows[2]!.baselineMm <= doc.size.heightMm - layout.contentInsetMm + 1e-6);
  });

  it("drar in texten innanför ramen", () => {
    const plain = layoutBadge(createBadgeDocument(["Anna"]), approxMeasure);
    const framed = layoutBadge(
      { ...createBadgeDocument(["Anna"]), frame: { style: "double", insetMm: 1.5, thicknessMm: 0.4 } },
      approxMeasure,
    );
    assert.equal(framed.frames.length, 2);
    assert.ok(framed.contentInsetMm > plain.contentInsetMm);
  });

  it("hoppar över tomma rader", () => {
    const layout = layoutBadge(createBadgeDocument(["Anna", "  "]), approxMeasure);
    assert.equal(layout.rows.length, 1);
  });
});

describe("renderBadgeSvg", () => {
  it("escapar text och använder leverantörens färgkonvention i produktion", () => {
    const doc = createBadgeDocument(["Ö & <Å>"]);
    const svg = renderBadgeSvg(doc, layoutBadge(doc, approxMeasure), { mode: "production" });
    assert.ok(svg.includes("Ö &amp; &lt;Å&gt;"));
    assert.ok(svg.includes('stroke="#FF0000"'));
    assert.ok(svg.includes('fill="#000000"'));
  });
});

describe("priceBadge", () => {
  it("ger lägre styckpris vid större antal", () => {
    const one = priceBadge({ ...createBadgeDocument(["Anna"]), quantity: 1 });
    const many = priceBadge({ ...createBadgeDocument(["Anna"]), quantity: 250 });
    assert.ok(many.unitSek < one.unitSek);
    assert.equal(many.totalSek, many.unitSek * 250);
  });
});

describe("badgeDocumentSchema", () => {
  it("godtar ett nytt dokument med text", () => {
    assert.equal(badgeDocumentSchema.safeParse(createBadgeDocument(["Anna"])).success, true);
  });

  it("nekar en skylt utan text och en färg som inte hör till materialet", () => {
    assert.equal(badgeDocumentSchema.safeParse(createBadgeDocument([""])).success, false);
    const doc = { ...createBadgeDocument(["Anna"]), materialId: "stainless" as const };
    assert.equal(badgeDocumentSchema.safeParse(doc).success, false);
  });
});
