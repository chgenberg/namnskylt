import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  approxFonts,
  badgeDocumentSchema,
  createBadgeDocument,
  engravingPaths,
  layoutBadge,
  renderBadgeSvg,
  type FontEngine,
} from "./index";
import { traceLogoMask, type RgbaPixels } from "./logo";
import { colorLogo, hasColor, visibleMask, withoutWhiteBackground } from "./logo-color";
import type { BadgeDocument, BadgeLogo } from "./types";

type Rgba = readonly [number, number, number, number];

const WHITE: Rgba = [255, 255, 255, 255];
const BLACK: Rgba = [0, 0, 0, 255];
const RED: Rgba = [220, 30, 40, 255];
const YELLOW: Rgba = [255, 221, 0, 255];
const CLEAR: Rgba = [0, 0, 0, 0];

function image(width: number, height: number, at: (x: number, y: number) => Rgba): RgbaPixels {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data.set(at(x, y), (y * width + x) * 4);
  return { data, width, height };
}

function pixel({ data, width }: RgbaPixels, x: number, y: number): number[] {
  return Array.from({ length: 4 }, (_, channel) => data[(y * width + x) * 4 + channel] ?? 0);
}

const inside = (x: number, y: number, left: number, top: number, right: number, bottom: number) =>
  x >= left && x <= right && y >= top && y <= bottom;

/** Svart ordbild med ett gult streck under, på genomskinlig botten — som en frilagd PNG. */
const wordmark = (background: Rgba) =>
  image(60, 30, (x, y) => (inside(x, y, 10, 8, 49, 17) ? BLACK : inside(x, y, 10, 20, 49, 22) ? YELLOW : background));

describe("hasColor", () => {
  it("en svart logga är inte i färg, varken frilagd eller på vit botten", () => {
    const black = (background: Rgba) => image(40, 20, (x, y) => (inside(x, y, 8, 5, 31, 14) ? BLACK : background));
    assert.equal(hasColor(black(CLEAR)), false);
    assert.equal(hasColor(withoutWhiteBackground(black(WHITE))), false);
  });

  it("svart, vitt och grått tillsammans är inte färg", () => {
    const grey = image(40, 20, (x) => (x < 13 ? BLACK : x < 26 ? [128, 128, 128, 255] : [250, 250, 250, 255]));
    assert.equal(hasColor(grey), false);
  });

  it("ett gult streck under en svart ordbild räcker för att loggan ska vara i färg", () => {
    assert.equal(hasColor(wordmark(CLEAR)), true);
  });

  it("enstaka färgade pixlar i en svart logga är brus, inte färg", () => {
    const noisy = image(100, 100, (x, y) => (x === 50 && y < 5 ? RED : BLACK));
    assert.equal(hasColor(noisy), false);
  });

  it("en helt genomskinlig bild har ingen färg", () => {
    assert.equal(hasColor(image(10, 10, () => CLEAR)), false);
  });
});

describe("withoutWhiteBackground", () => {
  it("tar bort en vit botten och lämnar loggans färger orörda", () => {
    const cleared = withoutWhiteBackground(wordmark(WHITE));
    assert.equal(pixel(cleared, 0, 0)[3], 0);
    assert.equal(pixel(cleared, 30, 26)[3], 0);
    assert.deepEqual(pixel(cleared, 20, 12), [...BLACK]);
    // Ett ljust gult streck ligger nära vitt i ljushet men är långt ifrån i färg.
    assert.deepEqual(pixel(cleared, 20, 21), [...YELLOW]);
  });

  it("vitt inuti loggan blir också genomskinligt, så att bokstävernas hål visar skylten", () => {
    const ring = image(30, 30, (x, y) => (inside(x, y, 5, 5, 24, 24) && !inside(x, y, 11, 11, 18, 18) ? RED : WHITE));
    const cleared = withoutWhiteBackground(ring);
    assert.equal(pixel(cleared, 15, 15)[3], 0);
    assert.deepEqual(pixel(cleared, 7, 7), [...RED]);
  });

  it("en utjämnad kant blir halvgenomskinlig i loggans färg, utan vit rand", () => {
    // En röd platta mitt i bilden, med en kantpixel som är mest vit botten och lite rött.
    const faint: Rgba = [251, 230, 231, 255];
    const edge = image(30, 12, (x, y) => (inside(x, y, 6, 3, 14, 8) ? RED : inside(x, y, 15, 3, 15, 8) ? faint : WHITE));
    const [r = 0, g = 0, b = 0, a = 0] = pixel(withoutWhiteBackground(edge), 15, 5);
    assert.ok(a > 0 && a < 255, `täckning ${a}`);
    // Färgen dras bort från det vita, mot loggans röda.
    assert.ok(g < faint[1] && b < faint[2] && r > g, `färg ${r},${g},${b}`);
    // Över vit botten blir pixeln samma färg som i filen.
    const over = (channel: number) => Math.round((channel * a + 255 * (255 - a)) / 255);
    assert.ok(Math.abs(over(g) - faint[1]) <= 2 && Math.abs(over(b) - faint[2]) <= 2, `över vitt ${over(r)},${over(g)},${over(b)}`);
  });

  it("en frilagd bild lämnas som den är", () => {
    const source = wordmark(CLEAR);
    assert.deepEqual(Array.from(withoutWhiteBackground(source).data), Array.from(source.data));
  });

  it("en färgad botten hör till loggan och lämnas kvar", () => {
    const blue: Rgba = [20, 60, 160, 255];
    const tile = image(30, 30, (x, y) => (inside(x, y, 10, 10, 19, 19) ? WHITE : blue));
    const cleared = withoutWhiteBackground(tile);
    assert.deepEqual(pixel(cleared, 0, 0), [...blue]);
    assert.deepEqual(pixel(cleared, 15, 15), [...WHITE]);
  });

  it("en heltäckande bild utan enfärgad kant lämnas som den är", () => {
    const photo = image(30, 30, (x, y) => [(x * 8) % 256, (y * 8) % 256, 255, 255]);
    assert.deepEqual(Array.from(withoutWhiteBackground(photo).data), Array.from(photo.data));
  });

  it("kopierar pixlarna i stället för att ändra den uppladdade bilden", () => {
    const source = wordmark(WHITE);
    const before = Array.from(source.data);
    withoutWhiteBackground(source);
    assert.deepEqual(Array.from(source.data), before);
  });
});

describe("colorLogo", () => {
  it("beskär en logga i färg till det som syns, med en pixels marginal", () => {
    const logo = colorLogo(wordmark(WHITE));
    assert.ok(logo);
    // Loggan täcker x 10–49 och y 8–22; marginalen lägger en pixel på varje sida.
    assert.equal(logo.width, 42);
    assert.equal(logo.height, 17);
    assert.deepEqual(pixel(logo, 1, 1), [...BLACK]);
    assert.equal(pixel(logo, 0, 0)[3], 0);
  });

  it("en svartvit logga ger null och graveras i stället", () => {
    assert.equal(colorLogo(image(40, 20, (x, y) => (inside(x, y, 8, 5, 31, 14) ? BLACK : WHITE))), null);
    assert.equal(colorLogo(image(40, 20, () => CLEAR)), null);
  });

  it("siluetten spåras i bildens egen ruta, så att banor och bild ligger över varandra", () => {
    const logo = colorLogo(wordmark(CLEAR));
    assert.ok(logo);
    const traced = traceLogoMask(visibleMask(logo), logo.width, logo.height, { keepFrame: true });
    assert.ok(traced);
    assert.equal(traced.viewWidth, logo.width);
    assert.equal(traced.viewHeight, logo.height);
    // Banorna börjar en pixel in, där marginalen slutar — inte i origo.
    const xs = (traced.d.match(/[ML](-?\d+(?:\.\d+)?)/g) ?? []).map((token) => Number(token.slice(1)));
    assert.ok(Math.min(...xs) >= 0.5 && Math.max(...xs) <= logo.width - 0.5, `x ${Math.min(...xs)}–${Math.max(...xs)}`);
  });
});

/** En giltig 1 × 1 px PNG. */
const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const ENGRAVED_LOGO: BadgeLogo = {
  d: "M0 0L10 0L10 10L0 10Z",
  viewWidth: 10,
  viewHeight: 10,
  placement: "left",
  heightMm: 12,
};
const COLOR_LOGO: BadgeLogo = { ...ENGRAVED_LOGO, image: { src: PNG } };

function withLogo(logo: BadgeLogo): BadgeDocument {
  return { ...createBadgeDocument(["Anna Lindqvist", "Projektledare"]), logo };
}

/** Typsnitt med konturer, så att gravyrens banor går att läsa ut i ett test. */
const outlineFonts: FontEngine = { ...approxFonts, outline: (text, _font, xMm, baselineMm) => `M${xMm} ${baselineMm}L${text.length} 0Z` };

describe("en logga i färg på skylten", () => {
  const doc = withLogo(COLOR_LOGO);
  const layout = layoutBadge(doc, approxFonts);

  it("läggs i samma ruta som en graverad logga", () => {
    const plain = layoutBadge(withLogo(ENGRAVED_LOGO), approxFonts).logo;
    assert.equal(layout.logo?.imageSrc, PNG);
    assert.deepEqual(
      { x: layout.logo?.x, y: layout.logo?.y, width: layout.logo?.width, height: layout.logo?.height },
      { x: plain?.x, y: plain?.y, width: plain?.width, height: plain?.height },
    );
    assert.equal(plain?.imageSrc, undefined);
  });

  it("graveras inte: bara texten finns bland gravyrens banor", () => {
    const kinds = (engravingPaths(layout, outlineFonts) ?? []).map((path) => path.kind);
    assert.ok(kinds.includes("text"));
    assert.ok(!kinds.includes("logo"));
    // Samma logga utan bild graveras som förut.
    const plain = engravingPaths(layoutBadge(withLogo(ENGRAVED_LOGO), outlineFonts), outlineFonts) ?? [];
    assert.ok(plain.some((path) => path.kind === "logo"));
  });

  it("ritas som bild i förhandsvisningen, i loggans ruta", () => {
    for (const fonts of [outlineFonts, approxFonts, undefined]) {
      const svg = renderBadgeSvg(doc, layout, { mode: "preview", fonts });
      const tag = svg.match(/<image [^>]*>/)?.[0] ?? "";
      assert.ok(tag.includes(`href="${PNG}"`), "bilden saknas");
      assert.ok(tag.includes(`width="${Number(layout.logo?.width.toFixed(4))}"`), tag.slice(-90));
      assert.ok(!svg.includes(layout.logo?.d ?? "saknas"), "banorna ska inte ritas");
    }
  });

  it("finns inte i verkstadens gravyrfil, varken som bild eller som banor", () => {
    for (const fonts of [outlineFonts, approxFonts, undefined]) {
      const svg = renderBadgeSvg(doc, layout, { mode: "production", fonts });
      assert.ok(!svg.includes("<image"));
      assert.ok(!svg.includes(layout.logo?.d ?? "saknas"));
    }
  });
});

describe("badgeDocumentSchema och loggan i färg", () => {
  const parse = (src: string) => badgeDocumentSchema.safeParse(withLogo({ ...COLOR_LOGO, image: { src } })).success;

  it("godtar en PNG som data-URL", () => {
    assert.equal(parse(PNG), true);
    assert.equal(badgeDocumentSchema.parse(withLogo(COLOR_LOGO)).logo?.image?.src, PNG);
  });

  it("stoppar allt annat än en PNG i base64", () => {
    assert.equal(parse("data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="), false);
    assert.equal(parse("data:image/jpeg;base64,AAAA"), false);
    assert.equal(parse("https://example.se/logo.png"), false);
    assert.equal(parse('data:image/png;base64,AAAA"/><script>alert(1)</script>'), false);
    assert.equal(parse("data:image/png;base64,"), false);
    assert.equal(parse(""), false);
  });

  it("stoppar en bild över taket", () => {
    assert.equal(parse(`data:image/png;base64,${"A".repeat(200_000)}`), false);
  });
});
