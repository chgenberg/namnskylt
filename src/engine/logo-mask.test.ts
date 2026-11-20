import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { inkMask, type RgbaPixels } from "./logo";

type Rgba = [number, number, number, number];
const CLEAR: Rgba = [0, 0, 0, 0];
const WHITE: Rgba = [255, 255, 255, 255];
const NAVY: Rgba = [0, 51, 102, 255];
const RED: Rgba = [200, 30, 40, 255];
const BLACK: Rgba = [10, 10, 10, 255];
const ORANGE: Rgba = [244, 123, 32, 255];

/** En bild där `paint` bestämmer färgen per pixel. */
function image(width: number, height: number, paint: (x: number, y: number) => Rgba): RgbaPixels {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data.set(paint(x, y), (y * width + x) * 4);
  return { data, width, height };
}

const inside = (x: number, y: number, x0: number, y0: number, x1: number, y1: number) => x >= x0 && x < x1 && y >= y0 && y < y1;
const at = (pixels: RgbaPixels, mask: Uint8Array, x: number, y: number) => mask[y * pixels.width + x];
const share = (mask: Uint8Array) => mask.reduce((sum, v) => sum + v, 0) / mask.length;

describe("inkMask — en logga ska synas, inte bli en svart klump", () => {
  it("vit text i en färgad platta på genomskinlig botten blir urtag i plattan", () => {
    const logo = image(80, 60, (x, y) => {
      if (!inside(x, y, 10, 10, 70, 50)) return CLEAR;
      return inside(x, y, 25, 25, 55, 35) ? WHITE : NAVY;
    });
    const mask = inkMask(logo);
    assert.equal(at(logo, mask, 15, 15), 1, "plattan graveras");
    assert.equal(at(logo, mask, 40, 30), 0, "texten lämnas");
    assert.equal(at(logo, mask, 2, 2), 0, "botten lämnas");
  });

  it("svart text i en röd platta syns, fast båda är mörka mot vitt", () => {
    const logo = image(80, 60, (x, y) => {
      if (!inside(x, y, 10, 10, 70, 50)) return WHITE;
      return inside(x, y, 25, 25, 55, 35) ? BLACK : RED;
    });
    const mask = inkMask(logo);
    assert.equal(at(logo, mask, 15, 15), 1, "plattan graveras");
    assert.equal(at(logo, mask, 40, 30), 0, "texten lämnas");
    assert.equal(at(logo, mask, 2, 2), 0, "den vita botten lämnas");
  });

  it("en ram med vit fyllning och text: ramen och texten graveras, fyllningen lämnas", () => {
    const logo = image(80, 60, (x, y) => {
      if (!inside(x, y, 10, 10, 70, 50)) return CLEAR;
      if (!inside(x, y, 14, 14, 66, 46)) return NAVY;
      return inside(x, y, 28, 26, 52, 34) ? NAVY : WHITE;
    });
    const mask = inkMask(logo);
    assert.equal(at(logo, mask, 11, 30), 1, "ramen graveras");
    assert.equal(at(logo, mask, 20, 20), 0, "fyllningen lämnas");
    assert.equal(at(logo, mask, 40, 30), 1, "texten graveras");
  });

  it("en enfärgad logga på genomskinlig botten graveras som den är", () => {
    const logo = image(60, 40, (x, y) => (inside(x, y, 10, 10, 50, 30) ? NAVY : CLEAR));
    const mask = inkMask(logo);
    assert.equal(at(logo, mask, 30, 20), 1);
    assert.ok(Math.abs(share(mask) - (40 * 20) / (60 * 40)) < 1e-9);
  });

  it("två ord i olika färger bredvid varandra graveras båda", () => {
    const logo = image(100, 40, (x, y) => {
      if (inside(x, y, 10, 10, 45, 30)) return NAVY;
      if (inside(x, y, 55, 10, 90, 30)) return ORANGE;
      return CLEAR;
    });
    const mask = inkMask(logo);
    assert.equal(at(logo, mask, 20, 20), 1);
    assert.equal(at(logo, mask, 70, 20), 1);
  });

  it("två färger kant i kant är två delar av loggan, inget urtag", () => {
    const logo = image(80, 40, (x, y) => {
      if (!inside(x, y, 10, 10, 70, 30)) return CLEAR;
      return x < 40 ? NAVY : ORANGE;
    });
    const mask = inkMask(logo);
    assert.equal(at(logo, mask, 20, 20), 1);
    assert.equal(at(logo, mask, 60, 20), 1);
  });

  it("mörk logga på vitt och vit logga på färg fungerar som förut", () => {
    const dark = image(40, 40, (x, y) => (inside(x, y, 10, 10, 30, 30) ? BLACK : WHITE));
    assert.equal(at(dark, inkMask(dark), 20, 20), 1);
    assert.equal(at(dark, inkMask(dark), 2, 2), 0);
    const light = image(40, 40, (x, y) => (inside(x, y, 10, 10, 30, 30) ? WHITE : NAVY));
    assert.equal(at(light, inkMask(light), 20, 20), 1);
    assert.equal(at(light, inkMask(light), 2, 2), 0);
  });

  it("enstaka avvikande pixlar i en platta är brus och blir inga urtag", () => {
    const logo = image(80, 60, (x, y) => {
      if (!inside(x, y, 10, 10, 70, 50)) return CLEAR;
      return x === 40 && y === 30 ? WHITE : NAVY;
    });
    assert.equal(at(logo, inkMask(logo), 40, 30), 1);
  });

  it("en suddig mörk logga på vit botten graveras fylld, inte som ihåliga konturer", () => {
    // En liten JPEG har en grå kant runt varje bokstav. Kanten är ingen platta med bokstaven som detalj.
    const GREY: Rgba = [118, 118, 118, 255];
    const logo = image(120, 60, (x, y) => {
      if (!inside(x, y, 20, 20, 100, 40)) return WHITE;
      return inside(x, y, 22, 22, 98, 38) ? BLACK : GREY;
    });
    const mask = inkMask(logo);
    assert.equal(at(logo, mask, 60, 30), 1, "bokstavens kärna graveras");
    assert.equal(at(logo, mask, 20, 30), 1, "kanten hör till bokstaven");
    assert.equal(at(logo, mask, 5, 5), 0, "botten lämnas");
  });

  it("en bred grå platta med svart text på vit botten är en platta: texten tas ur", () => {
    const GREY: Rgba = [118, 118, 118, 255];
    const logo = image(120, 60, (x, y) => {
      if (!inside(x, y, 10, 8, 110, 52)) return WHITE;
      return inside(x, y, 40, 24, 80, 36) ? BLACK : GREY;
    });
    const mask = inkMask(logo);
    assert.equal(at(logo, mask, 20, 16), 1, "plattan graveras");
    assert.equal(at(logo, mask, 60, 30), 0, "texten lämnas");
  });

  it("invertering vänder på hela masken", () => {
    const logo = image(40, 40, (x, y) => (inside(x, y, 10, 10, 30, 30) ? NAVY : CLEAR));
    const mask = inkMask(logo, true);
    assert.equal(at(logo, mask, 20, 20), 0);
    assert.equal(at(logo, mask, 2, 2), 1);
  });
});
