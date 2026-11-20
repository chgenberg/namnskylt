import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { approxFonts, badgeDocumentSchema, createBadgeDocument, layoutBadge, renderBadgeSvg } from "./index";
import { otsuThreshold, placeLogoPath, smoothPixels, traceLogoMask, type RgbaPixels } from "./logo";
import { engravedBadge } from "./testing";
import type { BadgeDocument, BadgeLogo } from "./types";

function mask(width: number, height: number, inked: (x: number, y: number) => boolean): Uint8Array {
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) out[y * width + x] = inked(x, y) ? 1 : 0;
  return out;
}

const SQUARE_LOGO: BadgeLogo = {
  d: "M0 0L10 0L10 10L0 10Z",
  viewWidth: 10,
  viewHeight: 10,
  placement: "left",
  heightMm: 14,
};

function withLogo(logo: Partial<BadgeLogo> = {}): BadgeDocument {
  // Utan vald metod, som skyltar sparades förut: namnet och en svartvit logga graveras.
  return { ...engravedBadge(["Anna Lindqvist", "Projektledare"]), logo: { ...SQUARE_LOGO, ...logo } };
}

describe("smoothPixels — en liten bild jämnas till innan den spåras", () => {
  const picture = (width: number, height: number, paint: (x: number, y: number) => [number, number, number, number]): RgbaPixels => {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data.set(paint(x, y), (y * width + x) * 4);
    return { data, width, height };
  };
  const red = (pixels: RgbaPixels, x: number, y: number) => pixels.data[(y * pixels.width + x) * 4] ?? 0;
  const alpha = (pixels: RgbaPixels, x: number, y: number) => pixels.data[(y * pixels.width + x) * 4 + 3] ?? 0;

  it("gör en trappstegskant till en jämn övergång och lämnar ytorna orörda", () => {
    // En sned kant i steg om fyra pixlar, som en liten bild som har förstorats.
    const stepped = picture(48, 48, (x, y) => (x < 16 + Math.floor(y / 4) ? [0, 0, 0, 255] : [255, 255, 255, 255]));
    const smooth = smoothPixels(stepped, 3);
    assert.equal(red(smooth, 2, 24), 0, "svart långt från kanten");
    assert.equal(red(smooth, 45, 24), 255, "vitt långt från kanten");
    const edge = red(smooth, 22, 24);
    assert.ok(edge > 40 && edge < 215, `kanten är en övergång, ${edge}`);
    // Tröskeln mitt i övergången flyttar sig jämnt per rad, inte i steg om fyra rader.
    const crossing = (y: number) => {
      for (let x = 0; x < 48; x++) if (red(smooth, x, y) >= 128) return x;
      return 48;
    };
    const jumps = [16, 20, 24, 28, 32].map((y) => crossing(y + 1) - crossing(y));
    assert.ok(jumps.every((jump) => jump >= 0 && jump <= 1), `hopp per rad ${jumps.join(",")}`);
  });

  it("låter inte osynliga pixlars färg färga kanten", () => {
    // Frilagd svart form: de genomskinliga pixlarna är vita i filen.
    const cut = picture(40, 40, (x) => (x < 20 ? [0, 0, 0, 255] : [255, 255, 255, 0]));
    const smooth = smoothPixels(cut, 3);
    assert.ok(alpha(smooth, 20, 20) > 0 && alpha(smooth, 20, 20) < 255, "kanten är halvgenomskinlig");
    assert.ok(red(smooth, 20, 20) < 8, `kanten är fortfarande svart, ${red(smooth, 20, 20)}`);
    assert.equal(alpha(smooth, 38, 20), 0, "det genomskinliga är kvar");
  });

  it("lämnar bilden orörd utan radie", () => {
    const flat = picture(4, 4, () => [10, 20, 30, 255]);
    assert.equal(smoothPixels(flat, 0), flat);
  });
});

describe("traceLogoMask med mjuk mask — kanten läggs mellan pixlarna", () => {
  // En sned kant, x = 12,3 + 0,37·y, med varje pixels täckning som genomskinlighet.
  const WIDTH = 40;
  const HEIGHT = 40;
  const edgeAt = (y: number) => 12.3 + 0.37 * y;
  const coverage = (x: number, y: number) => Math.min(1, Math.max(0, edgeAt(y) - (x - 0.5)));
  const soft = new Float32Array(WIDTH * HEIGHT);
  const hard = new Uint8Array(WIDTH * HEIGHT);
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      soft[y * WIDTH + x] = coverage(x, y);
      hard[y * WIDTH + x] = coverage(x, y) >= 128 / 255 ? 1 : 0;
    }
  }
  /** Största avståndet i x mellan banans punkter på den sneda kanten och den riktiga kanten. */
  const worst = (d: string) => {
    const numbers = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
    let far = 0;
    for (let i = 0; i + 1 < numbers.length; i += 2) {
      const x = numbers[i] ?? 0;
      const y = numbers[i + 1] ?? 0;
      // Punkterna längs bildens kant hör inte till den sneda kanten.
      if (x < 6 || y < 2 || y > HEIGHT - 3) continue;
      far = Math.max(far, Math.abs(x - edgeAt(y)));
    }
    return far;
  };

  it("följer en sned kant på en dryg tiondels pixel när, mot uppåt en halv utan", () => {
    const plain = traceLogoMask(hard, WIDTH, HEIGHT, { keepFrame: true, tolerancePx: 0.05 });
    const fine = traceLogoMask(hard, WIDTH, HEIGHT, { keepFrame: true, tolerancePx: 0.05, soft: [soft] });
    assert.ok(plain && fine);
    assert.ok(worst(plain.d) > 0.3, `utan mjuk mask ${worst(plain.d)}`);
    // Banans tal har en decimal, så en tjugondel går bort i avrundningen.
    assert.ok(worst(fine.d) < 0.15, `med mjuk mask ${worst(fine.d)}`);
  });

  it("gör en rak kant till få punkter, där pixelkanten ger många", () => {
    const corners = (d: string) => d.split("L").length;
    const plain = traceLogoMask(hard, WIDTH, HEIGHT, { keepFrame: true, tolerancePx: 0.3 });
    const fine = traceLogoMask(hard, WIDTH, HEIGHT, { keepFrame: true, tolerancePx: 0.3, soft: [soft] });
    assert.ok(plain && fine);
    // Fyra hörn, vart och ett avfasat av spåraren: åtta eller nio punkter.
    assert.ok(corners(fine.d) <= 10, `med mjuk mask ${corners(fine.d)} hörn`);
    assert.ok(corners(plain.d) > corners(fine.d) * 2, `utan ${corners(plain.d)}, med ${corners(fine.d)}`);
  });

  it("ändrar aldrig vad som är bläck: en mjuk mask som säger emot masken används inte", () => {
    const wrong = Float32Array.from(soft, (v) => 1 - v);
    const plain = traceLogoMask(hard, WIDTH, HEIGHT, { keepFrame: true });
    const same = traceLogoMask(hard, WIDTH, HEIGHT, { keepFrame: true, soft: [wrong] });
    assert.equal(same?.d, plain?.d);
    // Den första som håller med masken används.
    const fine = traceLogoMask(hard, WIDTH, HEIGHT, { keepFrame: true, soft: [soft] });
    const second = traceLogoMask(hard, WIDTH, HEIGHT, { keepFrame: true, soft: [wrong, soft] });
    assert.equal(second?.d, fine?.d);
  });
});

describe("otsuThreshold", () => {
  it("lägger gränsen mellan två tydliga grupper", () => {
    const t = otsuThreshold([10, 12, 14, 11, 240, 238, 242, 239]);
    assert.ok(t >= 14 && t < 238, `tröskel ${t}`);
  });
});

describe("traceLogoMask", () => {
  it("beskär till bläcket och ger en sluten kontur", () => {
    const traced = traceLogoMask(mask(20, 20, (x, y) => x >= 5 && x < 15 && y >= 5 && y < 15), 20, 20);
    assert.ok(traced);
    assert.ok(Math.abs(traced.viewWidth - 10) <= 1, `bredd ${traced.viewWidth}`);
    assert.ok(Math.abs(traced.viewHeight - 10) <= 1, `höjd ${traced.viewHeight}`);
    assert.equal(traced.d.match(/M/g)?.length, 1);
    assert.ok(traced.d.endsWith("Z"));
  });

  it("behåller hål som egen kontur", () => {
    const ring = mask(30, 30, (x, y) => {
      const r = Math.hypot(x - 15, y - 15);
      return r < 12 && r > 6;
    });
    const traced = traceLogoMask(ring, 30, 30);
    assert.equal(traced?.d.match(/M/g)?.length, 2);
  });

  it("släpper brus och tomma bilder", () => {
    assert.equal(traceLogoMask(mask(10, 10, () => false), 10, 10), null);
    assert.equal(traceLogoMask(mask(10, 10, (x, y) => x === 3 && y === 3), 10, 10), null);
  });

  it("ger banor som klarar schemat", () => {
    const traced = traceLogoMask(mask(40, 20, (x, y) => (x - 20) ** 2 / 300 + (y - 10) ** 2 / 64 < 1), 40, 20);
    assert.ok(traced);
    const doc = { ...withLogo(), logo: { ...SQUARE_LOGO, ...traced } };
    assert.equal(badgeDocumentSchema.safeParse(doc).success, true);
  });
});

describe("placeLogoPath", () => {
  it("skalar och flyttar koordinatpar", () => {
    assert.equal(placeLogoPath("M0 0L10 5Z", 2, 1, 3), "M1 3L21 13Z");
  });
});

describe("layoutBadge med logga", () => {
  it("lägger loggan till vänster och flyttar texten åt höger", () => {
    const plain = layoutBadge(createBadgeDocument(["Anna"]), approxFonts);
    const layout = layoutBadge({ ...withLogo(), rows: createBadgeDocument(["Anna"]).rows }, approxFonts);
    assert.ok(layout.logo);
    assert.ok(layout.logo.x < 5);
    assert.ok(layout.rows[0]!.leftMm > layout.logo.x + layout.logo.width);
    assert.ok(layout.rows[0]!.xMm > plain.rows[0]!.xMm);
  });

  it("lägger loggan till höger med texten före", () => {
    const layout = layoutBadge(withLogo({ placement: "right" }), approxFonts);
    assert.ok(layout.logo);
    for (const row of layout.rows) assert.ok(row.leftMm + row.widthMm <= layout.logo.x + 0.01);
  });

  it("staplar loggan ovanför texten", () => {
    const doc = { ...withLogo({ placement: "top" as const, heightMm: 10 }), size: { widthMm: 76, heightMm: 40 } };
    const layout = layoutBadge(doc, approxFonts);
    assert.ok(layout.logo);
    const firstTop = layout.rows[0]!.baselineMm - layout.rows[0]!.capHeightMm;
    assert.ok(firstTop >= layout.logo.y + layout.logo.height);
    assert.ok(Math.abs(layout.logo.x + layout.logo.width / 2 - 38) < 0.01);
  });

  it("håller loggan inom skylten och proportionerna", () => {
    const layout = layoutBadge(withLogo({ heightMm: 40, viewWidth: 40, viewHeight: 10 }), approxFonts);
    assert.ok(layout.logo);
    assert.ok(layout.logo.height <= 25);
    assert.ok(Math.abs(layout.logo.width / layout.logo.height - 4) < 0.01);
  });

  it("graverar loggan i ritningen", () => {
    const doc = withLogo();
    const svg = renderBadgeSvg(doc, layoutBadge(doc, approxFonts), { mode: "production" });
    assert.match(svg, /<path d="M[\d.]+ [\d.]+L[^"]*Z" fill="#000000" fill-rule="evenodd"\/>/);
  });
});

describe("badgeDocumentSchema och loggan", () => {
  it("släpper inte igenom annat än M/L/Z-banor", () => {
    const evil = withLogo({ d: 'M0 0L1 1Z"/><script>alert(1)</script>' });
    assert.equal(badgeDocumentSchema.safeParse(evil).success, false);
    assert.equal(badgeDocumentSchema.safeParse(withLogo()).success, true);
  });
});
