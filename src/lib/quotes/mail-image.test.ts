import assert from "node:assert/strict";
import { describe, test } from "node:test";
import sharp from "sharp";
import { createBadgeDocument, toOfferedDocument } from "@/engine";
import { renderMailBadge } from "./mail-image";
import { QUOTE_PICTURE } from "./quote-email";

describe("skyltens bild till offertmejlet", () => {
  test("bilden är en PNG, dubbelt så stor som den visas, med skylten i mitten", async () => {
    const png = await renderMailBadge(toOfferedDocument(createBadgeDocument(["Anna Lind", "Säljare"])));
    const meta = await sharp(png).metadata();
    assert.deepEqual({ format: meta.format, width: meta.width, height: meta.height }, { format: "png", width: QUOTE_PICTURE.width * 2, height: QUOTE_PICTURE.height * 2 });
    const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
    const pixel = (x: number, y: number) => [0, 1, 2].map((c) => data[(y * info.width + x) * info.channels + c] ?? 0);
    const [r, g, b] = pixel(8, 8);
    // Hörnet är papper, och mitt i bilden ligger mässingen eller texten, alltså inte papper.
    assert.ok((r ?? 0) > 235 && (g ?? 0) > 232 && (b ?? 0) > 225, `hörnet är ${r},${g},${b}`);
    const [mr, , mb] = pixel(Math.round(info.width * 0.36), Math.round(info.height * 0.3));
    assert.ok((mr ?? 0) - (mb ?? 0) > 40, "skylten i mässing syns i bilden");
  });
});
