import assert from "node:assert/strict";
import { describe, it } from "node:test";
import sharp from "sharp";
import { badgeShotUploadSchema, decodeImageDataUrl, normalizeBadgeShot } from "./badge-shot";

async function pngDataUrl(): Promise<string> {
  const plate = await sharp({ create: { width: 400, height: 140, channels: 4, background: { r: 212, g: 160, b: 23, alpha: 1 } } })
    .png()
    .toBuffer();
  const canvas = await sharp({ create: { width: 1600, height: 900, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: plate, left: 600, top: 380 }])
    .png()
    .toBuffer();
  return `data:image/png;base64,${canvas.toString("base64")}`;
}

describe("stillbilden av skylten", () => {
  it("beskär bort den tomma ytan och sparar som WebP", async () => {
    const shot = await normalizeBadgeShot(await pngDataUrl());
    assert.ok(shot?.startsWith("data:image/webp;base64,"));
    const decoded = decodeImageDataUrl(shot ?? "");
    const meta = await sharp(decoded?.body).metadata();
    assert.equal(meta.width, 448, "400 px skylt + 6 % luft på varje sida");
    assert.ok((meta.height ?? 0) < 250, "den tomma ytan är bortskuren");
    assert.equal(meta.hasAlpha, true);
  });

  it("ger upp tyst när bilden inte går att läsa", async () => {
    assert.equal(await normalizeBadgeShot("data:image/png;base64,aGVq"), null);
    assert.equal(await normalizeBadgeShot(undefined), null);
  });

  it("tar bara emot bild-data-URL:er", () => {
    assert.equal(badgeShotUploadSchema.safeParse("data:image/png;base64,iVBORw0KGgo=").success, true);
    assert.equal(badgeShotUploadSchema.safeParse("data:image/svg+xml;base64,PHN2Zz4=").success, false);
    assert.equal(badgeShotUploadSchema.safeParse("https://evil.example/x.png").success, false);
  });
});
