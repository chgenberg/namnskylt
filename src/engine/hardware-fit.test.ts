import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createBadgeDocument, withBlank, withMounting, withShapePreset } from "./document";
import { CLIP_FIT, clipPlate, fitHardware, type HardwareFootprint } from "./hardware-fit";
import { availableHalfWidth, effectiveCornerRadius } from "./shape";
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

/** En egen form som är en rektangel med rundade hörn, med klämma. */
const customRect = (widthMm: number, heightMm: number, cornerRadiusMm: number): BadgeDocument => ({
  ...plastic,
  shape: "custom",
  size: { widthMm, heightMm },
  cornerRadiusMm,
  customOutline: [
    { x: 0, y: 0 },
    { x: widthMm, y: 0 },
    { x: widthMm, y: heightMm },
    { x: 0, y: heightMm },
  ],
  mounting: "clip",
});

/** Klämmans yta på baksidan, som 3D-vyn anger den: mitt på skylten och kant i kant. */
function clipOn(doc: BadgeDocument): HardwareFootprint {
  const plate = clipPlate(doc);
  const upright = doc.clipOrientation === "vertical";
  return {
    widthMm: upright ? plate.wideMm : plate.longMm,
    heightMm: upright ? plate.longMm : plate.wideMm,
    centerYMm: doc.size.heightMm / 2,
    ...CLIP_FIT,
  };
}

describe("klämman ligger kant i kant med skylten", () => {
  it("täcker hela baksidan på Lång rektangel, med skyltens hörnrundning", () => {
    const long = withMounting(withBlank(plastic, "rectangle-long"), "clip");
    assert.deepEqual(clipPlate(long), { longMm: 80, wideMm: 25, cornerRadiusMm: effectiveCornerRadius(long) });
    assert.equal(long.size.widthMm, 80);
    assert.equal(long.size.heightMm, 25);
    assert.equal(effectiveCornerRadius(long), 3);
  });

  it("är 80 × 25 mm också på en större skylt, och sitter då mitt på", () => {
    const large = customRect(100, 40, 3);
    assert.deepEqual(clipPlate(large), { longMm: 80, wideMm: 25, cornerRadiusMm: 1.2 });
    assert.deepEqual(fitHardware(large, clipOn(large)), { centerYMm: 20, scale: 1 });
  });

  it("följer hörnen på en egen form i klämmans mått, i stället för att förminskas", () => {
    const doc = customRect(80, 25, 3);
    const fit = fitHardware(doc, clipOn(doc));
    assert.equal(fit.scale, 1);
    assert.equal(fit.centerYMm, 12.5);
    // Formens hörn är en polygon, så rundningen som ryms blir en aning större än formens egen.
    assert.ok(fit.cornerRadiusMm !== undefined && fit.cornerRadiusMm >= 3 && fit.cornerRadiusMm < 3.3, String(fit.cornerRadiusMm));
    // Ett fäste som ska ha luft mot kanten, och inte får rundas, förminskas på samma form.
    const { widthMm, heightMm, centerYMm } = clipOn(doc);
    assert.ok(fitHardware(doc, { widthMm, heightMm, centerYMm }).scale < 1);
  });

  it("ligger kant i kant på höjden på en stående egen form", () => {
    const doc: BadgeDocument = { ...customRect(25, 80, 2), clipOrientation: "vertical" };
    assert.deepEqual(clipPlate(doc), { longMm: 80, wideMm: 25, cornerRadiusMm: 1.2 });
    const fit = fitHardware(doc, clipOn(doc));
    assert.equal(fit.scale, 1);
    assert.equal(fit.centerYMm, 40);
    assert.ok(fit.cornerRadiusMm !== undefined && fit.cornerRadiusMm >= 2 && fit.cornerRadiusMm < 2.3, String(fit.cornerRadiusMm));
  });

  it("förminskas fortfarande på en form där den inte ryms, och hålls då inom formen", () => {
    const star = resizeToClip(withShapePreset(plastic, "star"));
    const fit = fitHardware(star, clipOn(star));
    assert.ok(fit.scale < 1, String(fit.scale));
    const half = (25 * fit.scale) / 2;
    assert.ok(availableHalfWidth(star, 0, fit.centerYMm - half + 3, fit.centerYMm + half - 3) * 2 >= 80 * fit.scale);
  });

  it("får skyltens mått på en äldre skylt som är mindre än klämman", () => {
    const old = withMounting(withBlank(plastic, "rectangle"), "clip");
    assert.deepEqual(clipPlate(old), { longMm: 75, wideMm: 25, cornerRadiusMm: effectiveCornerRadius(old) });
  });

  it("rundar inte hörnen där plattan ligger en bit in från skyltens hörn", () => {
    const tall = withMounting(withBlank(plastic, "rectangle-large"), "clip");
    assert.deepEqual(clipPlate(tall), { longMm: 75, wideMm: 25, cornerRadiusMm: 1.2 });
  });
});

/** Stjärnan med klämma: 80 × 80 mm, så klämman går att välja men ryms inte i full storlek. */
function resizeToClip(doc: BadgeDocument): BadgeDocument {
  return { ...doc, mounting: "clip" };
}
