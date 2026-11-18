import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getColor, getMaterial, offeredColors } from "./catalog";
import { byFront, colorNames } from "./color-choice";
import { createBadgeDocument, isOfferedDocument, toOfferedDocument } from "./document";

const plastic = getMaterial("plastic");
const metal = getMaterial("metal");
/** Plastens färger som säljs: det kunden väljer bland. */
const sold = offeredColors(plastic);

describe("plastens färger", () => {
  it("har verkstadens arton kombinationer för 1,5 mm, med de fyra klassiska först", () => {
    assert.equal(plastic.colors.length, 18);
    assert.deepEqual(plastic.colors.slice(0, 4).map((c) => c.id), ["white-black", "black-white", "gold-black", "silver-black"]);
    assert.equal(new Set(plastic.colors.map((c) => c.id)).size, 18);
    // Finns bara i 1,5 mm hos verkstaden, och hör därför hemma här.
    assert.ok(plastic.colors.some((c) => c.id === "green-black"));
  });

  it("går alla att beställa, utom den som har utgått", () => {
    // En plastskylt på plastens rektangel: metallens och plastens ämnen har olika mått.
    const base = toOfferedDocument({ ...createBadgeDocument(["Anna Lind"]), materialId: "plastic", colorId: "white-black" });
    assert.equal(sold.length, 17);
    for (const color of sold) assert.equal(isOfferedDocument({ ...base, colorId: color.id }), true, color.id);
    assert.equal(isOfferedDocument({ ...base, colorId: "violet-white" }), false);
  });

  it("gul med röd gravyr säljs inte längre, men en sparad skylt i den färgen ritas som den är", () => {
    const base = toOfferedDocument({ ...createBadgeDocument(["Anna Lind"]), materialId: "plastic", colorId: "white-black" });
    const old = { ...base, colorId: "yellow-red" };
    assert.equal(sold.some((c) => c.id === "yellow-red"), false);
    assert.equal(isOfferedDocument(old), false);
    // Färgen finns kvar i materialet, så att skylten ritas gul med röd gravyr och inte i materialets första färg.
    assert.deepEqual([getColor("plastic", "yellow-red").surface, getColor("plastic", "yellow-red").engraving], ["#FFD200", "#E31C23"]);
    // Öppnas den i skyltmotorn blir den gul med svart gravyr: samma framsida, en gravyrfärg som säljs.
    assert.equal(toOfferedDocument(old).colorId, "yellow-black");
    assert.equal(toOfferedDocument({ ...old, materialId: "plastic-2-layer" }).colorId, "yellow-black");
    // Vit med röd gravyr säljs fortfarande.
    assert.equal(isOfferedDocument({ ...base, colorId: "white-red" }), true);
  });

  it("en skylt i äldre plast behåller sin färg när den flyttas till dagens plast", () => {
    const base = createBadgeDocument(["Anna Lind"]);
    for (const colorId of ["red-white", "white-blue", "darkbrown-white"]) {
      const moved = toOfferedDocument({ ...base, materialId: "plastic-2-layer", colorId });
      assert.equal(moved.materialId, "plastic");
      assert.equal(moved.colorId, colorId);
    }
  });
});

describe("färgvalet", () => {
  it("delar kombinationens namn i framsida och kärna", () => {
    assert.deepEqual(colorNames({ name: "Vit / Svart" }), { front: "Vit", core: "Svart" });
    assert.deepEqual(colorNames({ name: "Borstat guld" }), { front: "Borstat guld", core: null });
  });

  it("visar varje kombination som ett eget val: sjutton för plasten, med samma framsida intill varandra", () => {
    const shown = byFront(sold);
    assert.equal(shown.length, 17);
    assert.deepEqual([...shown].map((c) => c.id).sort(), [...sold].map((c) => c.id).sort());
    // Vit med svart, blå och röd kärna står bredvid varandra, och de klassiska färgerna kommer först.
    assert.deepEqual(shown.slice(0, 6).map((c) => c.id), ["white-black", "white-blue", "white-red", "black-white", "gold-black", "silver-black"]);
    const green = shown.findIndex((c) => c.id === "green-white");
    assert.equal(shown[green + 1]?.id, "green-black");
    // Gul finns bara med svart sedan gul med röd utgick.
    assert.deepEqual(shown.filter((c) => c.surface === "#FFD200").map((c) => c.id), ["yellow-black"]);
  });

  it("metallen har en prick per yta, som förut", () => {
    assert.deepEqual(byFront(offeredColors(metal)).map((c) => c.name), ["Vit matt", "Mässing", "Nickel"]);
  });
});
