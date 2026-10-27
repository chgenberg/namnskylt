import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createBadgeDocument, type BadgeDocument } from "@/engine";
import { genitive } from "./genitive";
import { SHARE_MAX_CHARS, decodeShareCode, encodeShareCode } from "./share-link";

describe("genitive", () => {
  it("lägger till s bara när namnet inte redan slutar på ett", () => {
    assert.equal(genitive("Kalle Olsson"), "Kalle Olssons");
    assert.equal(genitive("Anna"), "Annas");
    assert.equal(genitive("Lars"), "Lars");
    assert.equal(genitive("Max"), "Max");
  });
});

describe("delningslänk", () => {
  it("packar och packar upp samma skylt", async () => {
    const doc: BadgeDocument = {
      ...createBadgeDocument(["Åsa Öberg", "Säljchef"]),
      colorId: "darkblue-white",
      logo: { d: "M0 0L10 0L10 10L0 10Z", viewWidth: 10, viewHeight: 10, placement: "top", heightMm: 8 },
      quantity: 40,
    };
    const { code, droppedLogo } = await encodeShareCode(doc);
    assert.equal(droppedLogo, false);
    assert.match(code, /^1\.[A-Za-z0-9_-]+$/);
    assert.deepEqual(await decodeShareCode(code), { ...doc, quantity: 1 });
  });

  it("tar bort en logga som gör länken för lång", async () => {
    const points = Array.from({ length: 6000 }, (_, i) => `L${(i * 7919) % 997} ${(i * 104729) % 991}`).join("");
    const doc: BadgeDocument = {
      ...createBadgeDocument(["Anna"]),
      logo: { d: `M0 0${points}Z`, viewWidth: 1000, viewHeight: 1000, placement: "left", heightMm: 12 },
    };
    const { code, droppedLogo } = await encodeShareCode(doc);
    assert.equal(droppedLogo, true);
    assert.ok(code.length <= SHARE_MAX_CHARS);
    assert.equal((await decodeShareCode(code))?.logo, undefined);
  });

  it("vägrar skräp, fel version och ogiltiga skyltar", async () => {
    assert.equal(await decodeShareCode(undefined), null);
    assert.equal(await decodeShareCode("1.!!!"), null);
    assert.equal(await decodeShareCode("2.abc"), null);
    const { code } = await encodeShareCode({ ...createBadgeDocument(["Anna"]), colorId: "finns-inte" });
    assert.equal(await decodeShareCode(code), null);
  });
});
