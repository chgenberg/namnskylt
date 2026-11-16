import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { OFFERED_MOUNTINGS, getMounting, mountingFits } from "./catalog";
import { createBadgeDocument, isOfferedDocument, toOfferedDocument } from "./document";
import type { BadgeDocument } from "./types";

const metal: BadgeDocument = { ...toOfferedDocument(createBadgeDocument(["Anna Lind"])), materialId: "metal", colorId: "metal-gold" };
const plastic: BadgeDocument = { ...metal, materialId: "plastic", colorId: "white-black" };

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
    assert.equal(getMounting("clip").note, "Endast för plastskyltar 80 × 25 mm");
    assert.deepEqual(
      OFFERED_MOUNTINGS.filter((mounting) => mounting.note).map((mounting) => mounting.id),
      ["clip"],
    );
  });

  it("en metallskylt med klämma går inte att beställa, men en plastskylt gör det", () => {
    assert.equal(isOfferedDocument({ ...metal, mounting: "pin" }), true);
    assert.equal(isOfferedDocument({ ...metal, mounting: "clip" }), false);
    assert.equal(isOfferedDocument({ ...plastic, mounting: "clip" }), true);
  });

  it("en äldre metallskylt med klämma får nål när den öppnas, och inget annat ändras", () => {
    const old = { ...metal, mounting: "clip" as const };
    const moved = toOfferedDocument(old);
    assert.equal(moved.mounting, "pin");
    assert.deepEqual({ ...moved, mounting: "clip" }, old);
    // En plastskylt med klämma är redan i sortimentet och lämnas som den är.
    const kept = { ...plastic, mounting: "clip" as const };
    assert.equal(toOfferedDocument(kept), kept);
  });

  it("en skylt i äldre plast som flyttas till dagens plast behåller sin klämma", () => {
    const moved = toOfferedDocument({ ...plastic, materialId: "plastic-2-layer", colorId: "white-black", mounting: "clip" });
    assert.equal(moved.materialId, "plastic");
    assert.equal(moved.mounting, "clip");
  });
});
