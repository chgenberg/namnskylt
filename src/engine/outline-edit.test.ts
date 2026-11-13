import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CUSTOM_SHAPE_LIMITS } from "./catalog";
import { customOutlineIssue } from "./custom-outline";
import { createBadgeDocument, resizeCustomShape, withShapePreset } from "./document";
import {
  insertOutlinePoint,
  longestEdge,
  matchingShapePreset,
  moveOutlinePoint,
  nearestOutlineHandle,
  outlineCorner,
  outlineEdgeMidpoint,
  outlineIssueEdges,
  proportionalCustomSize,
  removeOutlinePoint,
  splittableEdges,
} from "./outline-edit";
import type { Point } from "./shape";
import { SHAPE_PRESETS } from "./shape-presets";

const box = { widthMm: 40, heightMm: 30 };
const rect: Point[] = [
  { x: 0, y: 0 },
  { x: 40, y: 0 },
  { x: 40, y: 30 },
  { x: 0, y: 30 },
];
const many = (count: number): Point[] => Array.from({ length: count }, (_, i) => ({ x: i, y: i % 2 }));

describe("flytta en punkt", () => {
  it("håller punkten inom måttrutan och avrundar till hundradels millimeter", () => {
    assert.deepEqual(moveOutlinePoint(rect, 0, { x: -4, y: 12.3456 }, box)[0], { x: 0, y: 12.35 });
    assert.deepEqual(moveOutlinePoint(rect, 0, { x: 55, y: 31 }, box)[0], { x: 40, y: 30 });
  });

  it("flyttar bara den valda punkten och lämnar originalet orört", () => {
    const moved = moveOutlinePoint(rect, 2, { x: 33.333, y: 99 }, box);
    assert.deepEqual(moved[2], { x: 33.33, y: 30 });
    assert.deepEqual([moved[0], moved[1], moved[3]], [rect[0], rect[1], rect[3]]);
    assert.deepEqual(rect[2], { x: 40, y: 30 });
  });
});

describe("lägga till och ta bort punkter", () => {
  it("lägger den nya punkten mitt på kanten, direkt efter kantens startpunkt", () => {
    const next = insertOutlinePoint(rect, 1);
    assert.equal(next.length, 5);
    assert.deepEqual(next[2], { x: 40, y: 15 });
    // Sista kanten går tillbaka till första punkten.
    assert.deepEqual(insertOutlinePoint(rect, 3)[4], { x: 0, y: 15 });
  });

  it("lägger inte till fler punkter än en skärmaskin får", () => {
    const full = many(CUSTOM_SHAPE_LIMITS.maxPoints);
    assert.deepEqual(insertOutlinePoint(full, 0), full);
    assert.deepEqual(splittableEdges(full, 0), []);
  });

  it("tar bort en punkt men lämnar alltid tre kvar", () => {
    assert.deepEqual(removeOutlinePoint(rect, 1), [rect[0], rect[2], rect[3]]);
    const triangle = rect.slice(0, 3);
    assert.deepEqual(removeOutlinePoint(triangle, 0), triangle);
    assert.deepEqual(removeOutlinePoint(rect, 9), rect);
  });

  it("visar bara handtag på kanter som är långa nog att dela", () => {
    assert.deepEqual(splittableEdges(rect, 35), [0, 2]);
    assert.deepEqual(splittableEdges(rect, 4), [0, 1, 2, 3]);
  });

  it("hittar den längsta kanten, även bland några utvalda", () => {
    assert.equal(longestEdge(rect), 0);
    assert.equal(longestEdge(rect, [1, 3]), 1);
    assert.equal(longestEdge([]), null);
  });
});

describe("måtten vid en hörnpunkt", () => {
  it("ger grannkanternas längd och vinkeln mellan dem", () => {
    assert.deepEqual(outlineCorner(rect, 1), { prevEdgeMm: 40, nextEdgeMm: 30, angleDeg: 90 });
    const first = outlineCorner(rect, 0);
    assert.deepEqual([first?.prevEdgeMm, first?.nextEdgeMm], [30, 40]);
  });

  it("mäter en punkt mitt på en rak kant som 180° och en spets som en liten vinkel", () => {
    const straight = outlineCorner(insertOutlinePoint(rect, 0), 1);
    assert.ok(Math.abs((straight?.angleDeg ?? 0) - 180) < 1e-6);
    const spike: Point[] = [
      { x: 0, y: 0 },
      { x: 20, y: 30 },
      { x: 40, y: 0 },
    ];
    const tip = outlineCorner(spike, 1);
    assert.ok(Math.abs((tip?.angleDeg ?? 0) - 67.38) < 0.01, String(tip?.angleDeg));
    assert.equal(outlineCorner(rect, 7), null);
  });
});

describe("träffytan i ritverktyget", () => {
  it("väljer den närmaste hörnpunkten inom räckhåll", () => {
    assert.deepEqual(nearestOutlineHandle(rect, { x: 38, y: 2 }, 5), { kind: "point", index: 1 });
    assert.equal(nearestOutlineHandle(rect, { x: 20, y: 15 }, 5), null);
  });

  it("väljer en kants mitt bara när den ligger närmare än varje hörnpunkt och kanten har ett handtag", () => {
    assert.deepEqual(outlineEdgeMidpoint(rect, 0), { x: 20, y: 0 });
    assert.deepEqual(nearestOutlineHandle(rect, { x: 21, y: 1 }, 5, [0, 1, 2, 3]), { kind: "edge", index: 0 });
    assert.equal(nearestOutlineHandle(rect, { x: 21, y: 1 }, 5, [1, 2, 3]), null);
    // Lika långt till hörnet som till kantens mitt: hörnet vinner.
    const tight: Point[] = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 30 },
      { x: 0, y: 30 },
    ];
    assert.deepEqual(nearestOutlineHandle(tight, { x: 1, y: 0 }, 5, [0]), { kind: "point", index: 0 });
  });
});

describe("kanterna bakom ett fel", () => {
  it("pekar ut kanten som är för kort", () => {
    const points: Point[] = [...rect.slice(0, 3), { x: 1, y: 30 }, { x: 0, y: 29.5 }];
    const issue = customOutlineIssue(points, box);
    assert.equal(issue, "short-edge");
    assert.deepEqual(outlineIssueEdges(points, issue), [3]);
  });

  it("pekar ut de två kanter som korsar varandra", () => {
    const bowTie: Point[] = [rect[0]!, rect[2]!, rect[1]!, rect[3]!];
    const issue = customOutlineIssue(bowTie, box);
    assert.equal(issue, "crossing");
    assert.deepEqual(outlineIssueEdges(bowTie, issue), [0, 2]);
  });

  it("pekar inte ut något när felet gäller hela formen eller när formen är hel", () => {
    assert.deepEqual(outlineIssueEdges(rect, null), []);
    assert.deepEqual(outlineIssueEdges(rect, "area"), []);
  });
});

describe("vilket formförslag konturen är", () => {
  const plastic = { ...createBadgeDocument(["Anna"]), materialId: "plastic" as const, colorId: "white-black" };

  it("känner igen varje förslag, även efter att måttet ändrats", () => {
    for (const preset of SHAPE_PRESETS) {
      const doc = withShapePreset(plastic, preset.id);
      assert.equal(matchingShapePreset(doc.customOutline ?? [], doc.size)?.id, preset.id);
      const resized = resizeCustomShape(resizeCustomShape(doc, { widthMm: 47, heightMm: 113 }), { widthMm: 91, heightMm: 38 });
      assert.equal(matchingShapePreset(resized.customOutline ?? [], resized.size)?.id, preset.id, `${preset.id} omskalad`);
    }
  });

  it("släpper förslaget när kunden har flyttat, lagt till eller tagit bort en punkt", () => {
    const doc = withShapePreset(plastic, "shield");
    const points = doc.customOutline ?? [];
    assert.equal(matchingShapePreset(moveOutlinePoint(points, 3, { x: 30, y: 60 }, doc.size), doc.size), null);
    assert.equal(matchingShapePreset(insertOutlinePoint(points, 0), doc.size), null);
    assert.equal(matchingShapePreset(removeOutlinePoint(points, 0), doc.size), null);
  });
});

describe("mått med proportionerna kvar", () => {
  it("låter den andra sidan följa med", () => {
    assert.deepEqual(proportionalCustomSize({ widthMm: 120, heightMm: 80 }, { widthMm: 60 }), { widthMm: 60, heightMm: 40 });
    assert.deepEqual(proportionalCustomSize({ widthMm: 60, heightMm: 40 }, { heightMm: 60 }), { widthMm: 90, heightMm: 60 });
    assert.deepEqual(proportionalCustomSize({ widthMm: 60, heightMm: 40 }, {}), { widthMm: 60, heightMm: 40 });
  });

  it("stannar när kortsidan når minsta måttet eller långsidan det största", () => {
    const { minSideMm, maxSideMm } = CUSTOM_SHAPE_LIMITS;
    assert.deepEqual(proportionalCustomSize({ widthMm: 100, heightMm: 50 }, { widthMm: 30 }), { widthMm: 50, heightMm: minSideMm });
    assert.deepEqual(proportionalCustomSize({ widthMm: 100, heightMm: 50 }, { heightMm: 400 }), { widthMm: maxSideMm, heightMm: 60 });
  });

  it("lämnar en form som redan når båda gränserna som den är", () => {
    const { minSideMm, maxSideMm } = CUSTOM_SHAPE_LIMITS;
    const slim = { widthMm: maxSideMm, heightMm: minSideMm };
    assert.deepEqual(proportionalCustomSize(slim, { widthMm: 60 }), slim);
  });
});
