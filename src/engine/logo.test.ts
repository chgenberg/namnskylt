import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { approxFonts, badgeDocumentSchema, createBadgeDocument, layoutBadge, renderBadgeSvg } from "./index";
import { otsuThreshold, placeLogoPath, traceLogoMask } from "./logo";
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
  return { ...createBadgeDocument(["Anna Lindqvist", "Projektledare"]), logo: { ...SQUARE_LOGO, ...logo } };
}

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
