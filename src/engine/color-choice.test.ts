import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getMaterial } from "./catalog";
import { colorChoices, colorNames } from "./color-choice";
import { createBadgeDocument, isOfferedDocument, toOfferedDocument } from "./document";

const plastic = getMaterial("plastic");
const metal = getMaterial("metal");

describe("plastens färger", () => {
  it("har verkstadens arton kombinationer för 1,5 mm, med de fyra klassiska först", () => {
    assert.equal(plastic.colors.length, 18);
    assert.deepEqual(plastic.colors.slice(0, 4).map((c) => c.id), ["white-black", "black-white", "gold-black", "silver-black"]);
    assert.equal(new Set(plastic.colors.map((c) => c.id)).size, 18);
    // Finns bara i 1,5 mm hos verkstaden, och hör därför hemma här.
    assert.ok(plastic.colors.some((c) => c.id === "green-black"));
  });

  it("går alla att beställa", () => {
    // En plastskylt på plastens rektangel: metallens och plastens ämnen har olika mått.
    const base = toOfferedDocument({ ...createBadgeDocument(["Anna Lind"]), materialId: "plastic", colorId: "white-black" });
    for (const color of plastic.colors) assert.equal(isOfferedDocument({ ...base, colorId: color.id }), true, color.id);
    assert.equal(isOfferedDocument({ ...base, colorId: "violet-white" }), false);
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
    const { fronts } = colorChoices(plastic.colors, "white-black");
    assert.equal(fronts.length, 14);
    assert.deepEqual(fronts.slice(0, 5).map((f) => f.name), ["Vit", "Svart", "Guld", "Silver", "Gul"]);
    assert.deepEqual(fronts.filter((f) => f.selected).map((f) => f.name), ["Vit"]);
  });

  it("frågar om gravyrens färg bara där framsidan finns med flera", () => {
    assert.deepEqual(colorChoices(plastic.colors, "white-black").cores.map((c) => c.name), ["Svart", "Blå", "Röd"]);
    assert.deepEqual(colorChoices(plastic.colors, "yellow-red").cores.map((c) => [c.name, c.selected]), [
      ["Svart", false],
      ["Röd", true],
    ]);
    assert.deepEqual(colorChoices(plastic.colors, "green-white").cores.map((c) => c.name), ["Vit", "Svart"]);
    assert.deepEqual(colorChoices(plastic.colors, "gold-black").cores, []);
    assert.deepEqual(colorChoices(plastic.colors, "blue-white").cores, []);
  });

  it("behåller gravyrens färg när framsidan byts, om den nya framsidan finns med den", () => {
    // Vit med röd gravyr vald: gul finns också med röd, grön gör det inte.
    const { fronts } = colorChoices(plastic.colors, "white-red");
    assert.equal(fronts.find((f) => f.name === "Gul")?.combo.id, "yellow-red");
    assert.equal(fronts.find((f) => f.name === "Grön")?.combo.id, "green-white");
    assert.equal(fronts.find((f) => f.name === "Vit")?.combo.id, "white-red");
    // Svart gravyr vald: grön finns med svart.
    assert.equal(colorChoices(plastic.colors, "gold-black").fronts.find((f) => f.name === "Grön")?.combo.id, "green-black");
  });

  it("varje kombination går att nå med högst två val", () => {
    for (const target of plastic.colors) {
      const front = colorChoices(plastic.colors, "white-black").fronts.find((f) => f.combo.surface === target.surface);
      assert.ok(front, target.id);
      const { cores } = colorChoices(plastic.colors, front.combo.id);
      assert.ok(front.combo.id === target.id || cores.some((c) => c.combo.id === target.id), target.id);
    }
  });

  it("metallen ser ut som förut: en prick per yta och inget andra steg", () => {
    const { fronts, cores } = colorChoices(metal.colors, "metal-gold");
    assert.deepEqual(fronts.map((f) => f.name), ["Vit matt", "Mässing", "Nickel"]);
    assert.deepEqual(cores, []);
  });

  it("en okänd vald färg markerar ingenting och ger inget andra steg", () => {
    const { fronts, cores } = colorChoices(plastic.colors, "finns-inte");
    assert.equal(fronts.some((f) => f.selected), false);
    assert.deepEqual(cores, []);
  });
});
