import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createBadgeDocument } from "./document";
import { badgeDocumentSchema } from "./schema";
import { availableHalfWidth, badgeOutline, effectiveCornerRadius, insetConvexPolygon, outlinePath } from "./shape";
import type { BadgeDocument, BadgeShape } from "./types";

function shaped(shape: BadgeShape, widthMm = 70, heightMm = 25): BadgeDocument {
  return { ...createBadgeDocument(["Anna"]), shape, size: { widthMm, heightMm } };
}

function pointsOf(doc: BadgeDocument, inset = 0) {
  const outline = badgeOutline(doc, inset);
  assert.ok(outline?.kind === "polygon");
  return outline.points;
}

describe("former", () => {
  it("kapseln har alltid halva höjden som radie", () => {
    assert.equal(effectiveCornerRadius({ ...shaped("stadium"), cornerRadiusMm: 2 }), 12.5);
  });

  it("sexkanten spetsas mot sidorna med leverantörens avskärning", () => {
    assert.deepEqual(pointsOf(shaped("hexagon")), [
      { x: 17.5, y: 0 },
      { x: 52.5, y: 0 },
      { x: 70, y: 12.5 },
      { x: 52.5, y: 25 },
      { x: 17.5, y: 25 },
      { x: 0, y: 12.5 },
    ]);
  });

  it("drar in varje kant lika långt, även på en utdragen form", () => {
    const inset = pointsOf(shaped("hexagon"), 2);
    assert.equal(inset.length, 6);
    assert.ok(Math.abs((inset[0]?.y ?? 0) - 2) < 1e-9);
    assert.ok(Math.abs((inset[3]?.y ?? 0) - 23) < 1e-9);
    // Spetsen flyttas mer än 2 mm eftersom vinkeln är spetsig.
    assert.ok((inset[5]?.x ?? 0) > 2);
  });

  it("växer utåt med negativ indragning och ger upp när formen äts upp", () => {
    const grown = pointsOf(shaped("octagon"), -1);
    assert.ok(Math.min(...grown.map((p) => p.x)) < 0);
    assert.equal(badgeOutline(shaped("hexagon"), 13), null);
    assert.deepEqual(insetConvexPolygon([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }], 5), []);
  });

  it("ger textytan efter formens smalaste punkt i bandet", () => {
    const hexagon = shaped("hexagon");
    assert.equal(availableHalfWidth(hexagon, 0, 12.5, 12.5), 35);
    assert.equal(availableHalfWidth(hexagon, 0, 0, 12.5), 17.5);
    assert.ok(availableHalfWidth(shaped("octagon"), 0, 2, 23) < availableHalfWidth(shaped("rectangle"), 0, 2, 23));
  });

  it("ritar en sluten kontur för varje form", () => {
    for (const shape of ["rectangle", "rounded", "stadium", "oval", "hexagon", "octagon"] as const) {
      assert.match(outlinePath(shaped(shape)), /^M.*Z$/, shape);
    }
    assert.match(outlinePath(shaped("round", 55, 55)), /^M0 27\.5a27\.5 27\.5/);
  });

  it("en rund skylt måste vara kvadratisk", () => {
    assert.equal(badgeDocumentSchema.safeParse(shaped("round", 55, 55)).success, true);
    assert.equal(badgeDocumentSchema.safeParse(shaped("round", 55, 40)).success, false);
  });
});
