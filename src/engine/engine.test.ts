import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  approxFonts,
  badgeDocumentSchema,
  createBadgeDocument,
  frameBands,
  layoutBadge,
  parseSmartInput,
  priceBadge,
  renderBadgeSvg,
} from "./index";
import { endPriceTable } from "./price-model";
import { DEFAULT_PRICE_MODEL } from "./default-price-model";

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
    const layout = layoutBadge(doc, approxFonts);
    const row = layout.rows[0]!;
    assert.equal(row.xMm, doc.size.widthMm / 2);
    assert.equal(row.capHeightMm, doc.rows[0]!.capHeightMm);
    assert.deepEqual(layout.issues, []);
  });

  it("krymper en lång rad så den ryms inom säkerhetszonen", () => {
    const doc = createBadgeDocument(["Maximiliana Lindqvist-Östergren"]);
    const layout = layoutBadge(doc, approxFonts);
    const row = layout.rows[0]!;
    assert.ok(row.widthMm <= doc.size.widthMm - 2 * layout.contentInsetMm + 1e-6);
    assert.equal(layout.issues[0]?.code, "row-shrunk");
  });

  it("ger ovalen smalare textyta än en rak skylt", () => {
    const text = ["Anna Lindqvist", "Projektledare", "Avdelningen för kvalitet"];
    const size = { widthMm: 70, heightMm: 25 };
    const rect = layoutBadge({ ...createBadgeDocument(text), shape: "rectangle", size }, approxFonts);
    const oval = layoutBadge({ ...createBadgeDocument(text), shape: "oval", size }, approxFonts);
    assert.ok(oval.rows[2]!.capHeightMm < rect.rows[2]!.capHeightMm);
  });

  it("håller textblocket inom höjden", () => {
    const doc = createBadgeDocument(["A", "B", "C"]);
    doc.rows.forEach((r) => (r.capHeightMm = 12));
    const layout = layoutBadge(doc, approxFonts);
    assert.ok(layout.rows[0]!.baselineMm - layout.rows[0]!.capHeightMm >= layout.contentInsetMm - 1e-6);
    assert.ok(layout.rows[2]!.baselineMm <= doc.size.heightMm - layout.contentInsetMm + 1e-6);
  });

  it("drar in texten innanför ramen", () => {
    const plain = layoutBadge(createBadgeDocument(["Anna"]), approxFonts);
    const framed = layoutBadge(
      { ...createBadgeDocument(["Anna"]), frame: { style: "double", insetMm: 1.5, thicknessMm: 0.4 } },
      approxFonts,
    );
    assert.equal(framed.frames.length, 2);
    assert.ok(framed.contentInsetMm > plain.contentInsetMm);
  });

  it("hoppar över tomma rader", () => {
    const layout = layoutBadge(createBadgeDocument(["Anna", "  "]), approxFonts);
    assert.equal(layout.rows.length, 1);
  });
});

describe("frameBands", () => {
  const withFrame = (style: "none" | "solid" | "double") => ({
    ...createBadgeDocument(["Anna"]),
    frame: { style, insetMm: 1.5, thicknessMm: 0.4 },
  });

  it("ger ett band per ring, utifrån och in", () => {
    assert.deepEqual(frameBands(withFrame("none")), []);
    assert.deepEqual(frameBands(withFrame("solid")), [{ insetMm: 1.5, thicknessMm: 0.4 }]);
    const [outer, inner] = frameBands(withFrame("double"));
    assert.deepEqual(outer, { insetMm: 1.5, thicknessMm: 0.4 });
    assert.ok(inner && inner.insetMm > outer!.insetMm + outer!.thicknessMm);
  });

  it("stämmer med ramarna i layouten", () => {
    for (const style of ["none", "solid", "double"] as const) {
      const doc = withFrame(style);
      assert.equal(frameBands(doc).length, layoutBadge(doc, approxFonts).frames.length);
    }
  });
});

describe("renderBadgeSvg", () => {
  it("escapar text och använder leverantörens färgkonvention i produktion", () => {
    const doc = createBadgeDocument(["Ö & <Å>"]);
    const svg = renderBadgeSvg(doc, layoutBadge(doc, approxFonts), { mode: "production" });
    assert.ok(svg.includes("Ö &amp; &lt;Å&gt;"));
    assert.ok(svg.includes('stroke="#FF0000"'));
    assert.ok(svg.includes('fill="#000000"'));
  });
});

describe("priceBadge", () => {
  it("ger lägre styckpris vid större antal", () => {
    const list = endPriceTable(DEFAULT_PRICE_MODEL);
    const one = priceBadge({ ...createBadgeDocument(["Anna"]), quantity: 10 }, list);
    const many = priceBadge({ ...createBadgeDocument(["Anna"]), quantity: 250 }, list);
    assert.ok(many.unitSek < one.unitSek);
    assert.equal(many.totalSek, many.unitSek * 250 + many.shippingSek);
  });
});

describe("badgeDocumentSchema", () => {
  it("godtar ett nytt dokument med text", () => {
    assert.equal(badgeDocumentSchema.safeParse(createBadgeDocument(["Anna"])).success, true);
  });

  it("godtar en skylt med bara logga, och loggan står då mitt på skylten", () => {
    const logo = { d: "M0 0L10 0L10 10L0 10Z", viewWidth: 10, viewHeight: 10, placement: "left" as const, heightMm: 12 };
    const only = { ...createBadgeDocument([""]), logo };
    assert.equal(badgeDocumentSchema.safeParse(only).success, true);
    const { logo: box, rows } = layoutBadge(only, approxFonts);
    assert.ok(box);
    assert.equal(rows.length, 0);
    // Mitt på skylten, inte vid sidan av en text som inte finns.
    assert.ok(Math.abs(box.x + box.width / 2 - only.size.widthMm / 2) < 1e-9);
    assert.ok(Math.abs(box.y + box.height / 2 - only.size.heightMm / 2) < 1e-9);
    // Med ett namn står loggan till vänster om texten, som förut.
    const named = layoutBadge({ ...createBadgeDocument(["Anna Lind"]), logo }, approxFonts);
    assert.ok(named.logo && named.logo.x + named.logo.width / 2 < only.size.widthMm / 2);
  });

  it("nekar en skylt utan text och en färg som inte hör till materialet", () => {
    assert.equal(badgeDocumentSchema.safeParse(createBadgeDocument([""])).success, false);
    const doc = { ...createBadgeDocument(["Anna"]), materialId: "stainless" as const };
    assert.equal(badgeDocumentSchema.safeParse(doc).success, false);
  });
});
