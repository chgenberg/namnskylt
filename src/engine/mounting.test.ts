import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CLIP_MIN, OFFERED_MOUNTINGS, clipOrientations, getMounting, mountingFits } from "./catalog";
import {
  clipOrientationOf,
  createBadgeDocument,
  isOfferedDocument,
  mountingFitsDocument,
  mountingLabel,
  resizeCustomShape,
  toOfferedDocument,
  withBlank,
  withFittingMounting,
  withMounting,
  withShapePreset,
} from "./document";
import { badgeDocumentSchema } from "./schema";
import type { BadgeDocument } from "./types";

const metal: BadgeDocument = { ...toOfferedDocument(createBadgeDocument(["Anna Lind"])), materialId: "metal", colorId: "metal-gold" };
/** Plastens rektangel, 75 × 25 mm: för kort för klämman. */
const plastic: BadgeDocument = withBlank({ ...metal, materialId: "plastic", colorId: "white-black" }, "rectangle");
/** Plastens långa rektangel, 80 × 25 mm: klämmans format. */
const long = withBlank(plastic, "rectangle-long");
/** En egen form i plast med valfritt mått. */
const custom = (widthMm: number, heightMm: number) => resizeCustomShape(withShapePreset(plastic, "shield"), { widthMm, heightMm });

describe("fästen per material", () => {
  it("klämman finns bara på plastskyltar, nål och magnet på alla", () => {
    assert.equal(mountingFits("clip", "plastic"), true);
    assert.equal(mountingFits("clip", "metal"), false);
    for (const mounting of ["pin", "magnet"] as const) {
      assert.equal(mountingFits(mounting, "metal"), true);
      assert.equal(mountingFits(mounting, "plastic"), true);
    }
  });

  it("klämman bär raden som står under den i väljaren, och de andra fästena har ingen", () => {
    // Måttet hålls ihop med hårda mellanslag.
    assert.equal(getMounting("clip").note?.replace(/\u00a0/g, " "), "Endast för plastskyltar på minst 80 × 25 mm");
    assert.deepEqual(
      OFFERED_MOUNTINGS.filter((mounting) => mounting.note).map((mounting) => mounting.id),
      ["clip"],
    );
  });

  it("en metallskylt med klämma går inte att beställa, men en plastskylt som är stor nog gör det", () => {
    assert.equal(isOfferedDocument({ ...metal, mounting: "pin" }), true);
    assert.equal(isOfferedDocument({ ...metal, mounting: "clip" }), false);
    assert.equal(isOfferedDocument({ ...long, mounting: "clip" }), true);
  });

  it("en äldre metallskylt med klämma får nål när den öppnas, och inget annat ändras", () => {
    const old = { ...metal, mounting: "clip" as const };
    const moved = toOfferedDocument(old);
    assert.equal(moved.mounting, "pin");
    assert.deepEqual({ ...moved, mounting: "clip" }, old);
    // En plastskylt med klämma i klämmans format är redan i sortimentet och lämnas som den är.
    const kept = { ...long, mounting: "clip" as const };
    assert.equal(toOfferedDocument(kept), kept);
  });

  it("en skylt i äldre plast som flyttas till dagens plast behåller sin klämma när den ryms", () => {
    const moved = toOfferedDocument({ ...long, materialId: "plastic-2-layer", colorId: "white-black", mounting: "clip" });
    assert.equal(moved.materialId, "plastic");
    assert.equal(moved.mounting, "clip");
  });
});

describe("klämmans minsta skylt", () => {
  it("är 80 × 25 mm liggande och 25 × 80 mm stående", () => {
    assert.deepEqual(CLIP_MIN, { longMm: 80, shortMm: 25 });
    assert.deepEqual(clipOrientations({ widthMm: 80, heightMm: 25 }), ["horizontal"]);
    assert.deepEqual(clipOrientations({ widthMm: 25, heightMm: 80 }), ["vertical"]);
    assert.deepEqual(clipOrientations({ widthMm: 100, heightMm: 90 }), ["horizontal", "vertical"]);
    // En millimeter för kort åt något håll räcker inte.
    assert.deepEqual(clipOrientations({ widthMm: 79, heightMm: 25 }), []);
    assert.deepEqual(clipOrientations({ widthMm: 80, heightMm: 24 }), []);
    assert.deepEqual(clipOrientations({ widthMm: 79, heightMm: 79 }), []);
  });

  it("stoppar klämman på alla fyra vanliga format, som är kortare än 80 mm", () => {
    for (const blankId of ["rectangle", "oval", "rectangle-large", "cushion"] as const) {
      const doc = withBlank(plastic, blankId);
      assert.equal(mountingFitsDocument(doc, "clip"), false, blankId);
      assert.equal(isOfferedDocument({ ...doc, mounting: "clip" }), false, blankId);
      // Nål och magnet går som förut.
      assert.equal(mountingFitsDocument(doc, "pin"), true, blankId);
      assert.equal(mountingFitsDocument(doc, "magnet"), true, blankId);
    }
  });

  it("släpper igenom klämman på den långa rektangeln och på en egen form som är stor nog", () => {
    assert.equal(mountingFitsDocument(long, "clip"), true);
    assert.equal(mountingFitsDocument(custom(80, 25), "clip"), true);
    assert.equal(mountingFitsDocument(custom(40, 90), "clip"), true);
    assert.equal(mountingFitsDocument(custom(70, 70), "clip"), false);
    assert.equal(isOfferedDocument({ ...custom(40, 90), mounting: "clip" }), true);
    assert.equal(isOfferedDocument({ ...custom(70, 70), mounting: "clip" }), false);
  });

  it("gäller oavsett material: metallen har varken plast eller ett format som räcker", () => {
    assert.equal(mountingFitsDocument(metal, "clip"), false);
    assert.equal(mountingFitsDocument({ ...metal, size: { widthMm: 80, heightMm: 25 } }, "clip"), false);
  });

  it("byter klämman mot nål på en äldre plastskylt som är för liten, och ändrar inget annat", () => {
    const old = { ...plastic, mounting: "clip" as const };
    assert.equal(isOfferedDocument(old), false);
    const moved = toOfferedDocument(old);
    assert.equal(moved.mounting, "pin");
    assert.deepEqual({ ...moved, mounting: "clip" }, old);
    assert.equal(isOfferedDocument(moved), true);
  });
});

describe("klämmans riktning", () => {
  it("är den som ryms när kunden inte har valt, liggande först", () => {
    assert.equal(clipOrientationOf({ ...long, mounting: "clip" }), "horizontal");
    assert.equal(clipOrientationOf({ ...custom(40, 90), mounting: "clip" }), "vertical");
    assert.equal(clipOrientationOf({ ...custom(100, 90), mounting: "clip" }), "horizontal");
    // Utan klämma, eller på en skylt där den inte ryms, finns ingen riktning.
    assert.equal(clipOrientationOf(long), null);
    assert.equal(clipOrientationOf({ ...plastic, mounting: "clip" }), null);
  });

  it("är kundens val där båda ryms, och den som ryms när valet inte gör det", () => {
    const both = { ...custom(100, 90), mounting: "clip" as const };
    assert.equal(clipOrientationOf({ ...both, clipOrientation: "vertical" }), "vertical");
    assert.equal(clipOrientationOf({ ...both, clipOrientation: "horizontal" }), "horizontal");
    assert.equal(clipOrientationOf({ ...long, mounting: "clip", clipOrientation: "vertical" }), "horizontal");
  });

  it("står i fästets namn, så att kund och verkstad läser samma sak", () => {
    assert.equal(mountingLabel({ ...long, mounting: "clip" }), "Klämma, horisontellt");
    assert.equal(mountingLabel({ ...custom(40, 90), mounting: "clip" }), "Klämma, vertikalt");
    assert.equal(mountingLabel(long), "Nål");
    assert.equal(mountingLabel({ ...long, mounting: "magnet" }), "Magnet");
    // En äldre skylt där klämman inte ryms heter bara Klämma.
    assert.equal(mountingLabel({ ...plastic, mounting: "clip" }), "Klämma");
  });

  it("följer inte med till ett annat fäste", () => {
    const upright: BadgeDocument = { ...custom(100, 90), mounting: "clip", clipOrientation: "vertical" };
    assert.equal("clipOrientation" in withMounting(upright, "magnet"), false);
    assert.equal(withMounting(upright, "clip").clipOrientation, "vertical");
  });

  it("släpps när måttet ändras så att den inte ryms, och klämman byts mot nål när ingen ryms", () => {
    const upright: BadgeDocument = { ...custom(100, 90), mounting: "clip", clipOrientation: "vertical" };
    // Lägre skylt: bara liggande ryms.
    const lower = withFittingMounting(resizeCustomShape(upright, { heightMm: 60 }));
    assert.equal(lower.mounting, "clip");
    assert.equal("clipOrientation" in lower, false);
    assert.equal(clipOrientationOf(lower), "horizontal");
    // Kortare också: klämman ryms inte alls.
    const small = withFittingMounting(resizeCustomShape(lower, { widthMm: 70 }));
    assert.equal(small.mounting, "pin");
    assert.equal("clipOrientation" in small, false);
    // En skylt där allt ryms lämnas som den är.
    assert.equal(withFittingMounting(upright), upright);
    assert.equal(withFittingMounting(long), long);
  });

  it("godtas av schemat, och saknas den är skylten giltig som förut", () => {
    const upright: BadgeDocument = { ...custom(100, 90), mounting: "clip", clipOrientation: "vertical" };
    assert.equal(badgeDocumentSchema.safeParse(upright).success, true);
    assert.equal(badgeDocumentSchema.safeParse({ ...long, mounting: "clip" }).success, true);
    assert.equal(badgeDocumentSchema.safeParse({ ...upright, clipOrientation: "sideways" }).success, false);
  });
});
