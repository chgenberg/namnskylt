import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { filledShape, logoOutline } from "./logo-invert";

/** En mask där `ink` avgör om en pixel är logga. */
function mask(width: number, height: number, ink: (x: number, y: number) => boolean): Uint8Array {
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) out[y * width + x] = ink(x, y) ? 1 : 0;
  return out;
}

/** En ruta med ett hål i mitten, kant i kant med bilden: som en appikon med ett "m" urtaget. */
const icon = mask(100, 100, (x, y) => !(x >= 40 && x < 60 && y >= 40 && y < 60));

describe("en inverterad form", () => {
  it("fyller hålen i formen, men inte det som når bildens kant", () => {
    const shape = filledShape(icon, 100, 100);
    assert.equal(shape[50 * 100 + 50], 1, "hålet är en del av formen");
    const bay = mask(60, 40, (x, y) => x >= 5 && x < 55 && y >= 5 && y < 35 && !(x >= 25 && x < 35 && y < 20));
    assert.equal(filledShape(bay, 60, 40)[10 * 60 + 30], 0, "en vik som når ut är botten");
  });

  it("får en kontur längs kanten, också där formen når bildens kant", () => {
    const outline = logoOutline(icon, 100, 100);
    assert.ok(outline);
    // Konturen är 5 % av den kortaste sidan: 5 px.
    assert.equal(outline.ring[50 * 100], 1);
    assert.equal(outline.ring[50 * 100 + 4], 1);
    assert.equal(outline.ring[50 * 100 + 6], 0);
    assert.equal(outline.ring[50 * 100 + 50], 0, "mitten är ingen kontur");
    // Innerkanten ligger mellan pixlarna, där avståndet når konturens bredd.
    assert.ok((outline.soft[50 * 100 + 4] ?? 0) > 0.5);
    assert.ok((outline.soft[50 * 100 + 5] ?? 1) <= 0.5);
  });

  it("är ingen form när loggan är lösa delar eller en tunn figur", () => {
    const word = mask(90, 30, (x) => x % 30 < 20);
    assert.equal(logoOutline(word, 90, 30), null);
    const diagonal = mask(80, 80, (x, y) => Math.abs(x - y) < 4);
    assert.equal(logoOutline(diagonal, 80, 80), null);
  });

  it("räknar en cirkel som en form", () => {
    const disc = mask(60, 60, (x, y) => (x - 29.5) ** 2 + (y - 29.5) ** 2 < 28 ** 2);
    assert.ok(logoOutline(disc, 60, 60));
  });
});
