import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createBadgeDocument, withShapePreset } from "./document";
import { fitHardware, type HardwareFootprint } from "./hardware-fit";
import { availableHalfWidth } from "./shape";
import { SHAPE_PRESETS } from "./shape-presets";
import type { BadgeDocument } from "./types";

const plastic: BadgeDocument = { ...createBadgeDocument(["Anna"]), materialId: "plastic", colorId: "white-black" };
/** Nålens yta på en skylt: en smal list strax ovanför mitten. */
const pinOn = (doc: BadgeDocument): HardwareFootprint => ({
  widthMm: doc.size.widthMm * 0.66,
  heightMm: 4,
  centerYMm: doc.size.heightMm * 0.36,
});

function inside(doc: BadgeDocument, footprint: HardwareFootprint, fit: { centerYMm: number; scale: number }): boolean {
  const half = (footprint.heightMm * fit.scale) / 2;
  return availableHalfWidth(doc, 1.5, fit.centerYMm - half, fit.centerYMm + half) * 2 >= footprint.widthMm * fit.scale;
}

describe("fästets plats på baksidan", () => {
  it("rör inte fästet på ett ämne", () => {
    const doc = createBadgeDocument(["Anna"]);
    assert.deepEqual(fitHardware(doc, pinOn(doc)), { centerYMm: doc.size.heightMm * 0.36, scale: 1 });
  });

  it("låter fästet sitta kvar på en egen form som är bred nog", () => {
    const doc = withShapePreset(plastic, "shield");
    assert.deepEqual(fitHardware(doc, pinOn(doc)), { centerYMm: doc.size.heightMm * 0.36, scale: 1 });
  });

  it("flyttar nålen ned till stjärnans armar, där den får plats i full storlek", () => {
    const doc = withShapePreset(plastic, "star");
    const footprint = pinOn(doc);
    assert.equal(inside(doc, footprint, { centerYMm: footprint.centerYMm, scale: 1 }), false, "på sin vanliga höjd sticker nålen ut");
    const fit = fitHardware(doc, footprint);
    assert.equal(fit.scale, 1);
    assert.ok(fit.centerYMm > footprint.centerYMm && fit.centerYMm < doc.size.heightMm * 0.6, String(fit.centerYMm));
    assert.equal(inside(doc, footprint, fit), true);
  });

  it("förminskar ett fäste som inte får plats någonstans i full storlek", () => {
    const doc = withShapePreset(plastic, "star");
    const magnet: HardwareFootprint = { widthMm: doc.size.widthMm * 0.6, heightMm: doc.size.heightMm * 0.5, centerYMm: doc.size.heightMm / 2 };
    const fit = fitHardware(doc, magnet);
    assert.ok(fit.scale < 1);
    assert.equal(inside(doc, magnet, fit), true);
  });

  it("håller fästet inom skylten på alla formförslag", () => {
    for (const preset of SHAPE_PRESETS) {
      const doc = withShapePreset(plastic, preset.id);
      const footprint = pinOn(doc);
      assert.equal(inside(doc, footprint, fitHardware(doc, footprint)), true, preset.id);
    }
  });
});
