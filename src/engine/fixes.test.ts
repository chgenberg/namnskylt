import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getColor } from "./catalog";
import { GOOD_CONTRAST, LOW_CONTRAST, contrastRatio } from "./color-choice";
import { createBadgeDocument, isOfferedDocument } from "./document";
import { badgeFixes, badgeProblems, type BadgeFix } from "./fixes";
import { layoutBadge } from "./layout";
import { withTextColor } from "./marking";
import { approxFonts } from "./measure";
import { plasticBadge } from "./testing";
import type { BadgeDocument, BadgeLogo } from "./types";

const problemsOf = (doc: BadgeDocument) => badgeProblems(doc, layoutBadge(doc, approxFonts));
const fixFor = (doc: BadgeDocument, target: BadgeFix["target"], logoColorIds?: readonly string[]) =>
  badgeFixes(doc, approxFonts, { logoColorIds }).find((fix) => fix.target === target);
const surface = (doc: BadgeDocument) => getColor(doc.materialId, doc.colorId).surface;

const SQUARE: BadgeLogo = { d: "M0 0H100V100H0Z", viewWidth: 100, viewHeight: 100, placement: "left", heightMm: 14 };
/** En logga i färg som trycks, med vit som huvudfärg: vit text för mörk botten. */
const WHITE_LOGO: BadgeLogo = { ...SQUARE, image: { src: "data:image/png;base64,iVBORw0KGgo=" }, colors: ["#FFFFFF", "#0057B8"] };

describe("rätta med en knapp", () => {
  it("en skylt utan anmärkningar har inga rättningar", () => {
    const doc = createBadgeDocument(["Anna Lind", "Säljare"]);
    assert.deepEqual(problemsOf(doc), []);
    assert.deepEqual(badgeFixes(doc, approxFonts), []);
  });

  it("ett tryck som syns dåligt byts mot den färg som syns bäst, och anmärkningen är borta", () => {
    const doc = withTextColor({ ...createBadgeDocument(["Anna Lind"]), colorId: "metal-white" }, "#C5CDD4");
    assert.deepEqual(problemsOf(doc), [{ target: "text-color" }]);
    const fix = fixFor(doc, "text-color");
    assert.ok(fix);
    assert.equal(fix.label, "Byt till svart");
    assert.equal(fix.doc.printColor, "#111111");
    assert.ok(contrastRatio(fix.doc.printColor, surface(fix.doc)) >= GOOD_CONTRAST);
    assert.deepEqual(problemsOf(fix.doc), []);
  });

  it("en textfärg som inte printas är ingen anmärkning: graverad text har plastens gravyrfärg", () => {
    const doc = withTextColor(plasticBadge(["Anna Lind"]), "#FFFFFF");
    assert.deepEqual(problemsOf(doc), []);
  });

  it("en rad i en färg som inte syns får först samma färg som övriga texten", () => {
    const base = { ...createBadgeDocument(["Anna Lind", "Säljare"]), colorId: "metal-white" };
    const doc = { ...base, rows: base.rows.map((row, i) => (i === 1 ? { ...row, printColor: "#FFD200" } : row)) };
    const row = doc.rows[1]!;
    assert.deepEqual(problemsOf(doc), [{ target: `row-color:${row.id}`, rowId: row.id }]);
    const fix = fixFor(doc, `row-color:${row.id}`);
    assert.ok(fix);
    assert.equal(fix.label, "Samma färg som övriga texten");
    assert.equal(fix.doc.rows[1]!.printColor, undefined);
    // Bara den raden ändras.
    assert.deepEqual(fix.doc.rows[0], doc.rows[0]);
  });

  it("en rad som inte ryms rättas med det smalare typsnittet, och texten ändras aldrig", () => {
    const doc = createBadgeDocument(["Maximiliana Wilhelmina Gustafsson-Lindqvist"]);
    const row = doc.rows[0]!;
    assert.deepEqual(problemsOf(doc), [{ target: `row-fit:${row.id}`, rowId: row.id, tooLong: true }]);
    const fix = fixFor(doc, `row-fit:${row.id}`);
    assert.ok(fix);
    assert.equal(fix.label, "Byt till Arial Narrow");
    assert.equal(fix.doc.rows[0]!.text, row.text);
    assert.ok(!layoutBadge(fix.doc, approxFonts).issues.some((issue) => issue.code === "row-too-long"));
  });

  it("en mindre logga prövas före allt annat, och den största som räcker väljs", () => {
    const doc = { ...createBadgeDocument(["Anna Lind", "Säljare"]), logo: SQUARE };
    const row = doc.rows[0]!;
    const fix = fixFor(doc, `row-fit:${row.id}`);
    assert.ok(fix);
    assert.equal(fix.label, "Gör loggan mindre");
    const height = fix.doc.logo!.heightMm;
    assert.equal(fix.doc.logo!.sizing, "free");
    assert.ok(!layoutBadge(fix.doc, approxFonts).issues.some((issue) => issue.rowId === row.id));
    // En millimeter större räcker inte.
    const larger = { ...doc, logo: { ...SQUARE, heightMm: height + 1, sizing: "free" as const } };
    assert.ok(layoutBadge(larger, approxFonts).issues.some((issue) => issue.rowId === row.id));
  });

  it("en logga i färg som inte syns mot ytan får en yta där den syns, helst skyltmotorns förslag", () => {
    const doc = { ...plasticBadge(["Anna Lind"]), marking: "engrave-name-print-logo", logo: WHITE_LOGO } as BadgeDocument;
    assert.deepEqual(problemsOf(doc), [{ target: "logo-contrast" }]);
    const any = fixFor(doc, "logo-contrast");
    assert.ok(any);
    assert.ok(contrastRatio("#FFFFFF", surface(any.doc)) >= LOW_CONTRAST);
    assert.deepEqual(problemsOf(any.doc), []);
    const preferred = fixFor(doc, "logo-contrast", ["blue-white"]);
    assert.equal(preferred?.doc.colorId, "blue-white");
    assert.equal(preferred?.label, `Byt skylten till ${getColor("plastic", "blue-white").name}`);
    // Ett förslag där loggan inte syns hoppas över.
    assert.notEqual(fixFor(doc, "logo-contrast", ["yellow-black"])?.doc.colorId, "yellow-black");
  });

  it("en rättning som skulle ge en ny anmärkning väljs inte", () => {
    // Mörkgrå text syns på vit plast men inte på svart: ytan för loggan får då inte bli svart.
    const doc = withTextColor({ ...plasticBadge(["Anna Lind"]), marking: "print", logo: WHITE_LOGO } as BadgeDocument, "#3A3A3A");
    assert.deepEqual(problemsOf(doc), [{ target: "logo-contrast" }]);
    const fix = fixFor(doc, "logo-contrast");
    if (fix) assert.deepEqual(problemsOf(fix.doc), []);
  });

  it("en graverad logga har gravyrens färg och är ingen anmärkning", () => {
    const doc = { ...plasticBadge(["Anna Lind"]), marking: "engrave", logo: WHITE_LOGO } as BadgeDocument;
    assert.ok(!problemsOf(doc).some((problem) => problem.target === "logo-contrast"));
  });

  it("en rättning ger aldrig en skylt som inte går att beställa", () => {
    const docs = [
      withTextColor({ ...createBadgeDocument(["Anna Lind"]), colorId: "metal-white" }, "#C5CDD4"),
      createBadgeDocument(["Maximiliana Wilhelmina Gustafsson-Lindqvist"]),
      { ...createBadgeDocument(["Anna Lind", "Säljare"]), logo: SQUARE },
      { ...plasticBadge(["Anna Lind"]), marking: "engrave-name-print-logo", logo: WHITE_LOGO } as BadgeDocument,
    ];
    for (const doc of docs) {
      assert.ok(isOfferedDocument(doc));
      for (const fix of badgeFixes(doc, approxFonts)) assert.ok(isOfferedDocument(fix.doc), fix.label);
    }
  });
});
