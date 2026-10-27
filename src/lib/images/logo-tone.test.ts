import assert from "node:assert/strict";
import { describe, it } from "node:test";
import sharp from "sharp";
import { darkPlate, isLightLogo } from "./logo-tone";

async function logo(ink: { r: number; g: number; b: number }, background: { r: number; g: number; b: number; alpha: number }) {
  const mark = await sharp({ create: { width: 120, height: 30, channels: 4, background: { ...ink, alpha: 1 } } }).png().toBuffer();
  const png = await sharp({ create: { width: 200, height: 80, channels: 4, background } })
    .composite([{ input: mark, left: 40, top: 25 }])
    .png()
    .toBuffer();
  return `data:image/png;base64,${png.toString("base64")}`;
}

const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 };
const WHITE = { r: 255, g: 255, b: 255 };
const INK = { r: 20, g: 20, b: 30 };

describe("ljus logga", () => {
  it("vit logga på genomskinlig botten behöver mörk platta", async () => {
    assert.equal(await isLightLogo(await logo(WHITE, CLEAR)), true);
  });

  it("mörk logga syns på vitt", async () => {
    assert.equal(await isLightLogo(await logo(INK, CLEAR)), false);
  });

  it("logga med egen vit bakgrund syns redan", async () => {
    assert.equal(await isLightLogo(await logo(INK, { ...WHITE, alpha: 1 })), false);
  });

  it("tål saknad och trasig bild", async () => {
    assert.equal(await isLightLogo(null), false);
    assert.equal(await isLightLogo("data:image/png;base64,aGVq"), false);
  });

  it("plattan blir butikens färg bara när den är mörk", () => {
    assert.equal(darkPlate("#0b1f3a"), "#0b1f3a");
    assert.equal(darkPlate("#ffd200"), "#111418");
  });
});
