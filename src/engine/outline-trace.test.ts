import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CUSTOM_SHAPE_LIMITS } from "./catalog";
import { customOutlineIssue, polygonArea } from "./custom-outline";
import type { RgbaPixels } from "./logo";
import { outlineFromMask, silhouetteMask } from "./outline-trace";

type Rgba = readonly [number, number, number, number];
const WHITE: Rgba = [255, 255, 255, 255];
const CLEAR: Rgba = [0, 0, 0, 0];

/** En mask där `inside(x, y)` avgör vad som är form. */
function maskOf(width: number, height: number, inside: (x: number, y: number) => boolean): Uint8Array {
  const mask = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) mask[y * width + x] = inside(x, y) ? 1 : 0;
  return mask;
}

/** En bild där `colorAt(x, y)` ger pixelns färg. */
function imageOf(width: number, height: number, colorAt: (x: number, y: number) => Rgba): RgbaPixels {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data.set(colorAt(x, y), (y * width + x) * 4);
  return { data, width, height };
}

const inRect = (x: number, y: number, x0: number, y0: number, x1: number, y1: number) => x >= x0 && x < x1 && y >= y0 && y < y1;
const count = (mask: Uint8Array) => mask.reduce((sum, v) => sum + v, 0);

describe("en flerfärgad figur blir en siluett", () => {
  const GREY: Rgba = [200, 200, 200, 255];
  const BLACK: Rgba = [0, 0, 0, 255];
  /** En ljusgrå kropp, 200 × 120 px, med en svart rand tvärs över. */
  const figure = (background: Rgba, body: Rgba, stripe: Rgba) =>
    imageOf(300, 200, (x, y) => (inRect(x, y, 50, 40, 250, 160) ? (inRect(x, y, 50, 90, 250, 110) ? stripe : body) : background));

  it("ljusgrå kropp med svart rand på vit botten: hela kroppen är form, inte bara randen", () => {
    assert.equal(count(silhouetteMask(figure(WHITE, GREY, BLACK))), 200 * 120);
  });

  it("gäller också en halvgenomskinlig kropp med täckande rand på genomskinlig botten", () => {
    assert.equal(count(silhouetteMask(figure(CLEAR, [40, 90, 160, 180], BLACK))), 200 * 120);
  });

  it("svagt brus i bottnen blir inte form", () => {
    const noisy = imageOf(300, 200, (x, y) => (inRect(x, y, 50, 40, 250, 160) ? BLACK : (x + y) % 2 ? WHITE : [246, 246, 246, 255]));
    assert.equal(count(silhouetteMask(noisy)), 200 * 120);
  });
});

describe("en mask blir en egen form", () => {
  it("gör en fylld rektangel till fyra hörn i största tillåtna mått", () => {
    const traced = outlineFromMask(maskOf(300, 200, (x, y) => inRect(x, y, 50, 50, 250, 150)), 300, 200);
    assert.ok(traced);
    assert.deepEqual([traced.widthMm, traced.heightMm], [CUSTOM_SHAPE_LIMITS.maxSideMm, 60]);
    assert.equal(traced.points.length, 4);
    assert.equal(customOutlineIssue(traced.points, traced), null);
    assert.ok(Math.abs(polygonArea(traced.points) - 120 * 60) < 80, String(polygonArea(traced.points)));
    // Medurs med översta vänstra hörnet först, som formförslagen.
    assert.ok((traced.points[0]?.x ?? 99) < 2 && (traced.points[0]?.y ?? 99) < 2);
    assert.ok((traced.points[1]?.x ?? 0) > 118);
  });

  it("följer utsidan av en ritad skärlinje, inte hålet innanför", () => {
    const line = (x: number, y: number) => inRect(x, y, 40, 40, 260, 150) && !inRect(x, y, 44, 44, 256, 146);
    const traced = outlineFromMask(maskOf(300, 200, line), 300, 200);
    assert.ok(traced);
    assert.equal(traced.points.length, 4);
    assert.deepEqual([traced.widthMm, traced.heightMm], [120, 60]);
    assert.ok(polygonArea(traced.points) > 120 * 60 * 0.97, "konturen omsluter hela ytan innanför linjen");
  });

  it("gör en cirkel till en mångsidig polygon som går att skära", () => {
    const traced = outlineFromMask(maskOf(400, 400, (x, y) => Math.hypot(x - 199.5, y - 199.5) < 180), 400, 400);
    assert.ok(traced);
    assert.deepEqual([traced.widthMm, traced.heightMm], [120, 120]);
    assert.ok(traced.points.length >= 12 && traced.points.length <= CUSTOM_SHAPE_LIMITS.maxPoints, String(traced.points.length));
    assert.equal(customOutlineIssue(traced.points, traced), null);
    const circle = Math.PI * 60 * 60;
    assert.ok(Math.abs(polygonArea(traced.points) - circle) / circle < 0.02, String(polygonArea(traced.points)));
  });

  it("väljer den största figuren när bilden har flera", () => {
    const two = (x: number, y: number) => inRect(x, y, 10, 10, 40, 40) || inRect(x, y, 80, 20, 280, 180);
    const traced = outlineFromMask(maskOf(300, 200, two), 300, 200);
    assert.ok(traced);
    assert.deepEqual([traced.widthMm, traced.heightMm], [120, 96]);
  });

  it("lägger en smal form mitt i en ruta med minsta tillåtna sida, utan att dra ut den", () => {
    const traced = outlineFromMask(maskOf(400, 100, (x, y) => inRect(x, y, 20, 40, 380, 64)), 400, 100);
    assert.ok(traced);
    assert.deepEqual([traced.widthMm, traced.heightMm], [120, CUSTOM_SHAPE_LIMITS.minSideMm]);
    const ys = traced.points.map((p) => p.y);
    assert.deepEqual([Math.min(...ys), Math.max(...ys)], [8.5, 16.5]);
    assert.equal(customOutlineIssue(traced.points, traced), null);
  });

  it("ger ingen form för en tom bild eller ett ensamt streck", () => {
    assert.equal(outlineFromMask(new Uint8Array(100 * 100), 100, 100), null);
    const stroke = maskOf(300, 300, (x, y) => Math.abs(x - y) <= 1 && x > 20 && x < 280);
    assert.equal(outlineFromMask(stroke, 300, 300), null);
  });

  it("lämnar inga för korta kanter efter sig, inte heller i en form med många hörn", () => {
    const star = (x: number, y: number) => {
      const angle = Math.atan2(y - 200, x - 200);
      return Math.hypot(x - 200, y - 200) < 110 + 70 * Math.cos(angle * 7);
    };
    const traced = outlineFromMask(maskOf(400, 400, star), 400, 400);
    assert.ok(traced);
    assert.equal(customOutlineIssue(traced.points, traced), null);
  });
});

describe("masken ur en uppladdad bild", () => {
  it("räknar det som syns som form när bakgrunden är genomskinlig", () => {
    const image = imageOf(100, 80, (x, y) => (inRect(x, y, 20, 20, 80, 60) ? [200, 30, 30, 255] : CLEAR));
    assert.equal(count(silhouetteMask(image)), 60 * 40);
  });

  it("gör en flerfärgad figur på vit botten till en enda siluett", () => {
    const image = imageOf(120, 80, (x, y) =>
      inRect(x, y, 20, 20, 60, 60) ? [0, 40, 110, 255] : inRect(x, y, 60, 20, 100, 60) ? [255, 210, 0, 255] : WHITE,
    );
    const mask = silhouetteMask(image);
    assert.equal(count(mask), 80 * 40);
    const traced = outlineFromMask(mask, image.width, image.height);
    assert.deepEqual([traced?.widthMm, traced?.heightMm, traced?.points.length], [120, 60, 4]);
  });

  it("hittar en ljus figur på mörk botten", () => {
    const image = imageOf(100, 80, (x, y) => (inRect(x, y, 30, 20, 70, 60) ? WHITE : [20, 30, 60, 255]));
    assert.equal(count(silhouetteMask(image)), 40 * 40);
  });

  it("ger en tom mask för en enfärgad bild, också med lite brus", () => {
    const noisy = imageOf(60, 60, (x, y) => [250 + ((x * 7 + y * 3) % 6), 252, 248 + ((x + y) % 5), 255]);
    assert.equal(count(silhouetteMask(noisy)), 0);
  });

  it("sluter en hårfin sned linje som bara hänger ihop diagonalt", () => {
    // En romb ritad med en pixels streck: grannpixlarna möts hörn mot hörn.
    const image = imageOf(201, 201, (x, y) => (Math.abs(x - 100) + Math.abs(y - 100) === 90 ? [0, 0, 0, 40] : CLEAR));
    const mask = silhouetteMask(image);
    const traced = outlineFromMask(mask, image.width, image.height);
    assert.ok(traced, "linjen blir en sluten form");
    assert.deepEqual([traced.widthMm, traced.heightMm, traced.points.length], [120, 120, 4]);
    assert.ok(polygonArea(traced.points) > 120 * 120 * 0.48);
  });
});
