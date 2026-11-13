import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CUSTOM_SHAPE_LIMITS } from "./catalog";
import {
  clearHalfWidth,
  customOutlineIssue,
  fitOutline,
  isSimplePolygon,
  offsetPolygon,
  polygonArea,
  roundPolygon,
  scaleOutline,
  simplifyOutline,
} from "./custom-outline";
import { createBadgeDocument, isOfferedDocument, resizeCustomShape, toOfferedDocument, withBlank, withShapePreset } from "./document";
import { layoutBadge } from "./layout";
import { approxFonts } from "./measure";
import { badgeDocumentSchema } from "./schema";
import { availableHalfWidth, badgeOutline, outlinePath, type Point } from "./shape";
import { SHAPE_PRESETS, presetOutline } from "./shape-presets";
import type { BadgeDocument } from "./types";

const plastic = (texts: string[] = ["Anna Lindqvist", "Säljare"]): BadgeDocument => ({
  ...createBadgeDocument(texts),
  materialId: "plastic",
  colorId: "white-black",
});
const square: Point[] = [
  { x: 0, y: 0 },
  { x: 40, y: 0 },
  { x: 40, y: 40 },
  { x: 0, y: 40 },
];
const box = { widthMm: 40, heightMm: 40 };
/** Ett U: mitten upptill är urskuren. */
const uShape: Point[] = [
  { x: 0, y: 0 },
  { x: 12, y: 0 },
  { x: 12, y: 28 },
  { x: 28, y: 28 },
  { x: 28, y: 0 },
  { x: 40, y: 0 },
  { x: 40, y: 40 },
  { x: 0, y: 40 },
];

describe("kontrollerna av en egen form", () => {
  it("godtar en kvadrat och ett U med inbuktning", () => {
    assert.equal(customOutlineIssue(square, box), null);
    assert.equal(customOutlineIssue(uShape, box), null);
  });

  it("stoppar en form som korsar sig själv", () => {
    const bowTie: Point[] = [
      { x: 0, y: 0 },
      { x: 40, y: 40 },
      { x: 40, y: 0 },
      { x: 0, y: 40 },
    ];
    assert.equal(isSimplePolygon(bowTie), false);
    assert.equal(customOutlineIssue(bowTie, box), "crossing");
  });

  it("stoppar för få punkter, punkter utanför måttet, för korta kanter och för liten yta", () => {
    assert.equal(customOutlineIssue(square.slice(0, 2), box), "points");
    assert.equal(customOutlineIssue([...square.slice(0, 3), { x: -3, y: 40 }], box), "outside");
    assert.equal(customOutlineIssue([...square.slice(0, 3), { x: 0.5, y: 40 }, { x: 0, y: 39.2 }], box), "short-edge");
    const sliver: Point[] = [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 3 },
      { x: 0, y: 3 },
    ];
    assert.equal(customOutlineIssue(sliver, box), "area");
    const many = Array.from({ length: CUSTOM_SHAPE_LIMITS.maxPoints + 1 }, (_, i) => ({ x: i * 0.5, y: 0 }));
    assert.equal(customOutlineIssue(many, box), "points");
  });
});

describe("hörnrundning", () => {
  it("skär av hörnen med en båge och håller sig innanför den ritade formen", () => {
    const rounded = roundPolygon(square, 5);
    assert.ok(rounded.length > square.length);
    assert.ok(rounded.every((p) => p.x >= -1e-9 && p.x <= 40 + 1e-9 && p.y >= -1e-9 && p.y <= 40 + 1e-9));
    assert.ok(rounded.every((p) => Math.hypot(p.x, p.y) > 1.5), "det skarpa hörnet är borta");
    // En kvadrat med radien 5 tappar (4 − π)·r² i yta.
    assert.ok(Math.abs(polygonArea(rounded) - (1600 - (4 - Math.PI) * 25)) < 1);
  });

  it("minskar radien där kanterna är korta, så att två hörn aldrig möts", () => {
    const rounded = roundPolygon(square, 100);
    assert.ok(polygonArea(rounded) > 1100, "formen finns kvar");
    assert.equal(isSimplePolygon(rounded), true);
  });

  it("utan radie är formen orörd", () => {
    assert.deepEqual(roundPolygon(square, 0), square);
  });
});

describe("indragning", () => {
  it("flyttar varje kant lika långt inåt, även i en inbuktning", () => {
    assert.deepEqual(offsetPolygon(square, 2), [
      { x: 2, y: 2 },
      { x: 38, y: 2 },
      { x: 38, y: 38 },
      { x: 2, y: 38 },
    ]);
    const inner = offsetPolygon(uShape, 2);
    assert.equal(inner.length, uShape.length);
    assert.ok(polygonArea(inner) < polygonArea(uShape));
    // Urtaget blir bredare när godset runt det krymper.
    assert.deepEqual(inner[1], { x: 10, y: 2 });
    assert.deepEqual(inner[2], { x: 10, y: 30 });
  });

  it("ger en tom form när inget finns kvar", () => {
    assert.deepEqual(offsetPolygon(square, 25), []);
    assert.deepEqual(offsetPolygon(uShape, 7), []);
  });

  it("spelar ingen roll åt vilket håll punkterna är ritade", () => {
    assert.equal(polygonArea(offsetPolygon([...square].reverse(), 2)), 36 * 36);
  });
});

describe("textytan i en egen form", () => {
  it("är hela bredden minus marginalen i en kvadrat", () => {
    assert.equal(clearHalfWidth(square, 20, 3, 15, 25), 17);
    assert.equal(clearHalfWidth(square, 20, 0, 0, 40), 20);
  });

  it("är noll där mitten ligger i en urskärning, och smal där godset är smalt", () => {
    // Mitten av U:et är urskuren ned till y = 28.
    assert.equal(clearHalfWidth(uShape, 20, 2, 5, 15), 0);
    // Under urskärningen finns hela bredden.
    assert.equal(clearHalfWidth(uShape, 20, 2, 32, 38), 18);
    // Ett band som når upp i urskärningen får ingen yta alls.
    assert.equal(clearHalfWidth(uShape, 20, 2, 20, 38), 0);
  });

  it("håller marginalen även mot en sned kant", () => {
    const diamond: Point[] = [
      { x: 20, y: 0 },
      { x: 40, y: 20 },
      { x: 20, y: 40 },
      { x: 0, y: 20 },
    ];
    // På höjden 10 är halvbredden 10; marginalen 2 mm vinkelrätt mot kanten tar 2·√2.
    const half = clearHalfWidth(diamond, 20, 2, 10, 10);
    assert.ok(Math.abs(half - (10 - 2 * Math.SQRT2)) < 0.01, String(half));
  });
});

describe("formförslagen", () => {
  it("är många, har unika namn och går alla att skära i sitt eget mått", () => {
    assert.ok(SHAPE_PRESETS.length >= 12);
    assert.equal(new Set(SHAPE_PRESETS.map((p) => p.id)).size, SHAPE_PRESETS.length);
    for (const preset of SHAPE_PRESETS) {
      const size = { widthMm: preset.widthMm, heightMm: preset.heightMm };
      assert.equal(customOutlineIssue(presetOutline(preset), size), null, preset.id);
      assert.ok(preset.widthMm <= CUSTOM_SHAPE_LIMITS.maxSideMm && preset.heightMm <= CUSTOM_SHAPE_LIMITS.maxSideMm, preset.id);
    }
  });

  it("ger en giltig plastskylt som går att beställa, med plats för text", () => {
    for (const preset of SHAPE_PRESETS) {
      const doc = withShapePreset(plastic(["Anna"]), preset.id);
      assert.equal(badgeDocumentSchema.safeParse(doc).success, true, preset.id);
      assert.equal(isOfferedDocument(doc), true, preset.id);
      assert.ok(outlinePath(doc).startsWith("M"), preset.id);
      const layout = layoutBadge(doc, approxFonts);
      assert.equal(layout.rows.length, 1, preset.id);
      assert.ok((layout.rows[0]?.widthMm ?? 0) > 5, `${preset.id}: texten får plats`);
    }
  });

  it("texten håller sig innanför stjärnans inbuktningar", () => {
    const doc = withShapePreset(plastic(["Anna Lindqvist", "Säljare"]), "star");
    const layout = layoutBadge(doc, approxFonts);
    for (const row of layout.rows) {
      const top = row.baselineMm - row.capHeightMm;
      const half = availableHalfWidth(doc, layout.contentInsetMm, top, row.baselineMm);
      assert.ok(row.widthMm <= 2 * half + 1e-6, `${row.text}: ${row.widthMm} mot ${2 * half}`);
    }
  });
});

describe("egen form i dokumentet", () => {
  it("går bara i plast: metallskylten är ett färdigt ämne", () => {
    const metal = withShapePreset(createBadgeDocument(["Anna"]), "shield");
    assert.equal(badgeDocumentSchema.safeParse(metal).success, false);
    assert.equal(isOfferedDocument(metal), false);
    const moved = toOfferedDocument(metal);
    assert.equal(moved.shape, "rounded");
    assert.equal(moved.customOutline, undefined);
    assert.equal(isOfferedDocument(moved), true);
  });

  it("får vara 120 × 120 mm, men en vanlig form får inte bli högre än förut", () => {
    const big = resizeCustomShape(withShapePreset(plastic(), "shield"), { widthMm: 120, heightMm: 120 });
    assert.deepEqual(big.size, { widthMm: 120, heightMm: 120 });
    assert.equal(badgeDocumentSchema.safeParse(big).success, true);
    const tooBig = resizeCustomShape(big, { widthMm: 500 });
    assert.equal(tooBig.size.widthMm, 120);
    const tall = { ...plastic(), size: { widthMm: 75, heightMm: 100 } };
    assert.equal(badgeDocumentSchema.safeParse(tall).success, false);
  });

  it("får vara så smal som gränsen för egen form, men en vanlig form får inte bli smalare än förut", () => {
    const { minSideMm } = CUSTOM_SHAPE_LIMITS;
    const small = resizeCustomShape(withShapePreset(plastic(), "diamond"), { widthMm: minSideMm, heightMm: minSideMm });
    assert.deepEqual(small.size, { widthMm: minSideMm, heightMm: minSideMm });
    assert.equal(isOfferedDocument(small), true);
    assert.equal(badgeDocumentSchema.safeParse(small).success, true);
    const narrow = { ...plastic(), size: { widthMm: minSideMm, heightMm: 25 } };
    assert.equal(badgeDocumentSchema.safeParse(narrow).success, false);
  });

  it("konturen följer med när måttet ändras", () => {
    const doc = withShapePreset(plastic(), "shield");
    const wide = resizeCustomShape(doc, { widthMm: doc.size.widthMm * 2 });
    assert.equal(wide.customOutline?.[1]?.x, (doc.customOutline?.[1]?.x ?? 0) * 2);
    assert.equal(wide.customOutline?.[1]?.y, doc.customOutline?.[1]?.y);
    assert.equal(badgeDocumentSchema.safeParse(wide).success, true);
  });

  it("en egen kontur släpps när kunden byter till ett ämne, och får inte finnas på andra former", () => {
    const doc = withShapePreset(plastic(), "star");
    const back = withBlank(doc, "oval");
    assert.equal(back.customOutline, undefined);
    assert.equal(isOfferedDocument(back), true);
    assert.equal(badgeDocumentSchema.safeParse({ ...back, customOutline: doc.customOutline }).success, false);
  });

  it("konturen dras in för ram och säkerhetszon, och försvinner när inget finns kvar", () => {
    const doc = withShapePreset(plastic(), "shield");
    const outer = badgeOutline(doc);
    const inner = badgeOutline(doc, 3);
    assert.ok(outer?.kind === "polygon" && inner?.kind === "polygon");
    assert.ok(polygonArea(inner.points) < polygonArea(outer.points));
    assert.equal(badgeOutline(doc, 40), null);
  });
});

describe("uppladdad form", () => {
  const circle = Array.from({ length: 400 }, (_, i) => {
    const a = (Math.PI * 2 * i) / 400;
    return { x: 500 + 300 * Math.cos(a), y: 400 + 200 * Math.sin(a) };
  });

  it("förenklas till högst 64 punkter utan att tappa formen", () => {
    const simple = simplifyOutline(circle);
    assert.ok(simple.length <= CUSTOM_SHAPE_LIMITS.maxPoints && simple.length >= 12, String(simple.length));
    assert.equal(isSimplePolygon(simple), true);
    assert.ok(polygonArea(simple) > polygonArea(circle) * 0.97);
  });

  it("läggs i måttrutan med bibehållna proportioner och blir en giltig form", () => {
    const fitted = fitOutline(simplifyOutline(circle), 120, 120);
    assert.ok(fitted);
    assert.deepEqual([fitted.widthMm, fitted.heightMm], [120, 80]);
    assert.equal(customOutlineIssue(fitted.points, fitted), null);
    assert.equal(fitOutline(square.slice(0, 2), 120, 120), null);
  });

  it("skalning rundar till hundradels millimeter", () => {
    assert.deepEqual(scaleOutline([{ x: 10, y: 10 }], { widthMm: 30, heightMm: 30 }, { widthMm: 40, heightMm: 30 }), [{ x: 13.33, y: 10 }]);
  });
});
