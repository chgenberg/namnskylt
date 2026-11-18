import assert from "node:assert/strict";
import { describe, test } from "node:test";
import sharp from "sharp";
import { mailLogo } from "./seller-logo";

const dataUrl = async (format: "png" | "webp", width: number, height: number, color = { r: 20, g: 30, b: 40, alpha: 1 }) => {
  const image = sharp({ create: { width, height, channels: 4, background: color } });
  const bytes = await (format === "webp" ? image.webp() : image.png()).toBuffer();
  return `data:image/${format};base64,${bytes.toString("base64")}`;
};

describe("säljarens logga för mejl", () => {
  test("en logga i WebP blir en PNG som ryms överst i mejlet, dubbelt så stor som den visas", async () => {
    const logo = await mailLogo(await dataUrl("webp", 900, 300), null);
    assert.ok(logo);
    assert.deepEqual({ width: logo.width, height: logo.height }, { width: 132, height: 44 });
    const meta = await sharp(logo.png).metadata();
    assert.deepEqual({ format: meta.format, width: meta.width, height: meta.height }, { format: "png", width: 264, height: 88 });
  });

  test("en bred logga begränsas av bredden", async () => {
    const logo = await mailLogo(await dataUrl("png", 1200, 120), null);
    assert.deepEqual({ width: logo?.width, height: logo?.height }, { width: 180, height: 18 });
  });

  test("en ljus logga får sin mörka platta med luft runt om", async () => {
    const logo = await mailLogo(await dataUrl("png", 300, 100, { r: 255, g: 255, b: 255, alpha: 1 }), "#111418");
    assert.ok(logo);
    assert.deepEqual({ width: logo.width, height: logo.height }, { width: 100, height: 44 });
    const { data } = await sharp(logo.png).raw().toBuffer({ resolveWithObject: true });
    // Hörnet är plattans färg, inte genomskinligt.
    assert.deepEqual([data[0], data[1], data[2]], [0x11, 0x14, 0x18]);
  });

  test("utan logga, eller med en fil som inte går att läsa, står namnet i stället", async () => {
    assert.equal(await mailLogo(null, null), null);
    assert.equal(await mailLogo("", null), null);
    assert.equal(await mailLogo("data:image/png;base64,aW50ZSBlbiBiaWxk", null), null);
  });
});
