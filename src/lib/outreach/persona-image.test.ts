import assert from "node:assert/strict";
import { test } from "node:test";
import sharp from "sharp";
import { MAX_PERSONA_BYTES, PERSONA_HEIGHT_PX, PERSONA_WIDTH_PX, personaJpeg } from "./persona-image";

/** 2:3 som bildmodellen: röd överdel (ansikte och skylt), blå nederdel (midjan). */
async function portrait(): Promise<Buffer> {
  const half = { width: 1024, height: 768, channels: 3 as const };
  const top = await sharp({ create: { ...half, background: "#ff0000" } }).png().toBuffer();
  return sharp({ create: { width: 1024, height: 1536, channels: 3, background: "#0000ff" } })
    .composite([{ input: top, top: 0, left: 0 }])
    .png()
    .toBuffer();
}

test("beskär till 4:5 uppifrån och håller sig liten", async () => {
  const image = await personaJpeg(await portrait());
  assert.equal(image.width, PERSONA_WIDTH_PX);
  assert.equal(image.height, PERSONA_HEIGHT_PX);
  assert.ok(image.bytes.length <= MAX_PERSONA_BYTES);
  const meta = await sharp(image.bytes).metadata();
  assert.equal(meta.format, "jpeg");
  assert.equal(meta.width, PERSONA_WIDTH_PX);

  const { data } = await sharp(image.bytes).extract({ left: 300, top: 5, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
  assert.ok((data[0] ?? 0) > 200 && (data[2] ?? 255) < 60, "överkanten ska vara kvar");
});
