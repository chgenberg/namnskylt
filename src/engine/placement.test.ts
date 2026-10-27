import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  approxFonts,
  availableHalfWidth,
  badgeDocumentSchema,
  clampOffset,
  createBadgeDocument,
  layoutBadge,
  safeInsetMm,
  snapToCenter,
  type BadgeDocument,
  type BadgeLayout,
  type Rect,
} from "./index";

const EPS = 1e-6;
const SQUARE_LOGO = { d: "M0 0L10 0L10 10L0 10Z", viewWidth: 10, viewHeight: 10, placement: "left" as const, heightMm: 10 };

function rectangle(overrides: Partial<BadgeDocument> = {}): BadgeDocument {
  return { ...createBadgeDocument(["Anna Lindqvist", "Projektledare"]), shape: "rectangle", ...overrides };
}

function assertInsideZone(doc: BadgeDocument, layout: BadgeLayout, box: Rect | null) {
  assert.ok(box);
  const inset = layout.contentInsetMm;
  assert.ok(box.y >= inset - EPS && box.y + box.height <= doc.size.heightMm - inset + EPS, `y ${box.y}–${box.y + box.height}`);
  const half = availableHalfWidth(doc, inset, box.y, box.y + box.height);
  const center = doc.size.widthMm / 2;
  assert.ok(box.x >= center - half - EPS && box.x + box.width <= center + half + EPS, `x ${box.x}–${box.x + box.width}`);
}

describe("säkerhetszonen", () => {
  it("följer leverantörens kantmarginal: 3 mm rakt, 2 mm på oval, mer innanför en ram", () => {
    assert.equal(safeInsetMm(rectangle()), 3);
    assert.equal(safeInsetMm(rectangle({ shape: "oval" })), 2);
    const framed = rectangle({ frame: { style: "solid", insetMm: 2, thicknessMm: 0.6 } });
    assert.equal(safeInsetMm(framed), 4.1);
  });

  it("smalnar av i stora rundade hörn", () => {
    const doc = rectangle({ shape: "rounded", cornerRadiusMm: 10 });
    const inset = safeInsetMm(doc);
    assert.equal(availableHalfWidth(doc, inset, 10, 15), 35 - inset);
    assert.ok(availableHalfWidth(doc, inset, inset, inset + 1) < 35 - inset - 2);
  });
});

describe("clampOffset", () => {
  const doc = rectangle();
  const box: Rect = { x: 30, y: 10, width: 10, height: 5 };

  it("lämnar en förflyttning inom zonen orörd", () => {
    assert.deepEqual(clampOffset(doc, 3, [box], { xMm: 5, yMm: -2 }), { xMm: 5, yMm: -2 });
  });

  it("stannar vid kanten när kunden drar utanför", () => {
    assert.deepEqual(clampOffset(doc, 3, [box], { xMm: 100, yMm: 100 }), { xMm: 27, yMm: 7 });
    assert.deepEqual(clampOffset(doc, 3, [box], { xMm: -100, yMm: -100 }), { xMm: -27, yMm: -7 });
  });

  it("drar en ruta i ovalens hörn inåt tills den ryms", () => {
    const oval = rectangle({ shape: "oval" });
    const offset = clampOffset(oval, 2, [box], { xMm: 100, yMm: -100 });
    const moved = { ...box, x: box.x + offset.xMm, y: box.y + offset.yMm };
    const half = availableHalfWidth(oval, 2, moved.y, moved.y + moved.height);
    assert.ok(moved.x + moved.width <= 35 + half + EPS);
    assert.ok(moved.y >= 2 - EPS);
  });
});

describe("layoutBadge med förflyttning", () => {
  it("håller dragen text inom zonen och flyttar alla rader tillsammans", () => {
    const auto = layoutBadge(rectangle(), approxFonts);
    const doc = rectangle({ textOffsetMm: { xMm: 90, yMm: 40 } });
    const layout = layoutBadge(doc, approxFonts);
    assertInsideZone(doc, layout, layout.textBox);
    const [first, second] = layout.rows;
    const [autoFirst, autoSecond] = auto.rows;
    assert.ok(first && second && autoFirst && autoSecond);
    assert.ok(Math.abs(first.baselineMm - autoFirst.baselineMm - (second.baselineMm - autoSecond.baselineMm)) < EPS);
    assert.ok(layout.textOffsetMm.xMm < 90 && layout.textOffsetMm.yMm < 40);
  });

  it("ändrar inget när kunden inte flyttat något", () => {
    const layout = layoutBadge(rectangle(), approxFonts);
    assert.deepEqual(layout.textOffsetMm, { xMm: 0, yMm: 0 });
    assertInsideZone(rectangle(), layout, layout.textBox);
  });

  it("håller loggan inom zonen och märker när den hamnar över texten", () => {
    const base = rectangle({ logo: SQUARE_LOGO });
    const auto = layoutBadge(base, approxFonts);
    assert.equal(auto.logoOverlapsText, false);

    const pushed = { ...base, logo: { ...SQUARE_LOGO, offsetMm: { xMm: -50, yMm: 50 } } };
    assertInsideZone(pushed, layoutBadge(pushed, approxFonts), layoutBadge(pushed, approxFonts).logo);

    const onText = { ...base, logo: { ...SQUARE_LOGO, offsetMm: { xMm: 20, yMm: 0 } } };
    assert.equal(layoutBadge(onText, approxFonts).logoOverlapsText, true);
  });
});

describe("snapToCenter", () => {
  const doc = rectangle();
  const box: Rect = { x: 10, y: 5, width: 20, height: 6 };

  it("drar rutans mitt till skyltens mittlinjer inom tröskeln", () => {
    const snapped = snapToCenter(doc, box, { xMm: 14.6, yMm: 4.2 }, 0.5);
    assert.deepEqual(snapped, { offset: { xMm: 15, yMm: 4.5 }, centerX: true, centerY: true });
  });

  it("släpper utanför tröskeln", () => {
    const snapped = snapToCenter(doc, box, { xMm: 12, yMm: 2 }, 0.5);
    assert.deepEqual(snapped, { offset: { xMm: 12, yMm: 2 }, centerX: false, centerY: false });
  });
});

describe("badgeDocumentSchema och förflyttningar", () => {
  it("godtar rimliga förflyttningar och stoppar orimliga", () => {
    assert.ok(badgeDocumentSchema.safeParse(rectangle({ textOffsetMm: { xMm: -4.5, yMm: 2 } })).success);
    assert.ok(!badgeDocumentSchema.safeParse(rectangle({ textOffsetMm: { xMm: 1e9, yMm: 0 } })).success);
    const logo = { ...SQUARE_LOGO, offsetMm: { xMm: Number.NaN, yMm: 0 } };
    assert.ok(!badgeDocumentSchema.safeParse(rectangle({ logo })).success);
  });
});
