import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getColor, getMaterial, offeredColors } from "./catalog";
import { colorChoices, colorNames } from "./color-choice";
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

describe("färgvalet i två steg", () => {
  it("delar kombinationens namn i framsida och kärna", () => {
    assert.deepEqual(colorNames({ name: "Vit / Svart" }), { front: "Vit", core: "Svart" });
    assert.deepEqual(colorNames({ name: "Borstat guld" }), { front: "Borstat guld", core: null });
  });

  it("visar en framsida per färg: fjorton för plasten", () => {
    const { fronts } = colorChoices(sold, "white-black");
    assert.equal(fronts.length, 14);
    assert.deepEqual(fronts.slice(0, 5).map((f) => f.name), ["Vit", "Svart", "Guld", "Silver", "Gul"]);
    assert.deepEqual(fronts.filter((f) => f.selected).map((f) => f.name), ["Vit"]);
  });

  it("frågar om gravyrens färg bara där framsidan finns med flera", () => {
    assert.deepEqual(colorChoices(sold, "white-black").cores.map((c) => c.name), ["Svart", "Blå", "Röd"]);
    assert.deepEqual(colorChoices(sold, "white-red").cores.map((c) => [c.name, c.selected]), [
      ["Svart", false],
      ["Blå", false],
      ["Röd", true],
    ]);
    assert.deepEqual(colorChoices(sold, "green-white").cores.map((c) => c.name), ["Vit", "Svart"]);
    assert.deepEqual(colorChoices(sold, "gold-black").cores, []);
    assert.deepEqual(colorChoices(sold, "blue-white").cores, []);
    // Gul finns bara med svart gravyr sedan gul med röd utgick: inget andra steg.
    assert.deepEqual(colorChoices(sold, "yellow-black").cores, []);
  });

  it("behåller gravyrens färg när framsidan byts, om den nya framsidan finns med den", () => {
    // Vit med röd gravyr vald: varken gul eller grön finns med röd, så de får sin första kombination.
    const { fronts } = colorChoices(sold, "white-red");
    assert.equal(fronts.find((f) => f.name === "Gul")?.combo.id, "yellow-black");
    assert.equal(fronts.find((f) => f.name === "Grön")?.combo.id, "green-white");
    assert.equal(fronts.find((f) => f.name === "Vit")?.combo.id, "white-red");
    // Svart gravyr vald: grön finns med svart.
    assert.equal(colorChoices(sold, "gold-black").fronts.find((f) => f.name === "Grön")?.combo.id, "green-black");
  });

  it("varje kombination går att nå med högst två val", () => {
    for (const target of sold) {
      const front = colorChoices(sold, "white-black").fronts.find((f) => f.combo.surface === target.surface);
      assert.ok(front, target.id);
      const { cores } = colorChoices(sold, front.combo.id);
      assert.ok(front.combo.id === target.id || cores.some((c) => c.combo.id === target.id), target.id);
    }
  });

  it("metallen ser ut som förut: en prick per yta och inget andra steg", () => {
    const { fronts, cores } = colorChoices(metal.colors, "metal-gold");
    assert.deepEqual(fronts.map((f) => f.name), ["Vit matt", "Mässing", "Nickel"]);
    assert.deepEqual(cores, []);
  });

  it("en okänd vald färg markerar ingenting och ger inget andra steg", () => {
    const { fronts, cores } = colorChoices(sold, "finns-inte");
    assert.equal(fronts.some((f) => f.selected), false);
    assert.deepEqual(cores, []);
  });
});
