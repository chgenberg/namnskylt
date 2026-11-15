import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { describe, it } from "node:test";
import { createBadgeDocument, logoImageRef, type BadgeDocument } from "@/engine";
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
      materialId: "plastic-2-layer",
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

  it("en logga i färg som ligger på servern ryms i länken, även när siluetten är för lång", async () => {
    const points = Array.from({ length: 6000 }, (_, i) => `L${(i * 7919) % 997} ${(i * 104729) % 991}`).join("");
    const image = { src: logoImageRef("ab".repeat(32)) };
    const doc: BadgeDocument = {
      ...createBadgeDocument(["Anna"]),
      logo: { d: `M0 0${points}Z`, viewWidth: 600, viewHeight: 200, placement: "top", heightMm: 8, image },
    };
    const { code, droppedLogo } = await encodeShareCode(doc);
    assert.equal(droppedLogo, false);
    assert.ok(code.length <= SHARE_MAX_CHARS);
    const shared = await decodeShareCode(code);
    // Bilden pekas ut som förut; siluetten är bildens ruta.
    assert.deepEqual(shared?.logo, { ...doc.logo, d: "M0 0L600 0L600 200L0 200Z" });
  });

  it("en kort siluett lämnas orörd för en logga i färg", async () => {
    const logo = { d: "M0 0L10 0L10 10L0 10Z", viewWidth: 10, viewHeight: 10, placement: "top" as const, heightMm: 8 };
    const doc: BadgeDocument = { ...createBadgeDocument(["Anna"]), logo: { ...logo, image: { src: logoImageRef("0f".repeat(32)) } } };
    assert.deepEqual((await decodeShareCode((await encodeShareCode(doc)).code))?.logo, doc.logo);
  });

  it("hänvisningen till loggans originalfil följer med i länken när den ryms", async () => {
    const originalId = "5e".repeat(32);
    const logo = { d: "M0 0L10 0L10 10L0 10Z", viewWidth: 10, viewHeight: 10, placement: "top" as const, heightMm: 8, originalId };
    const doc: BadgeDocument = { ...createBadgeDocument(["Anna"]), logo };
    const { code, droppedLogo } = await encodeShareCode(doc);
    assert.equal(droppedLogo, false);
    assert.equal((await decodeShareCode(code))?.logo?.originalId, originalId);
    // Även när siluetten byts mot bildens ruta: då är länken kort.
    const points = Array.from({ length: 6000 }, (_, i) => `L${(i * 7919) % 997} ${(i * 104729) % 991}`).join("");
    const color: BadgeDocument = {
      ...doc,
      logo: { ...logo, d: `M0 0${points}Z`, viewWidth: 600, viewHeight: 200, image: { src: logoImageRef("ab".repeat(32)) } },
    };
    const framed = await decodeShareCode((await encodeShareCode(color)).code);
    assert.equal(framed?.logo?.d, "M0 0L600 0L600 200L0 200Z");
    assert.equal(framed?.logo?.originalId, originalId);
  });

  it("hänvisningen till originalfilen stryks först när länken blir för lång, och loggan står kvar", async () => {
    // Slumpartat id, som en riktig SHA-256: det går inte att komprimera.
    const originalId = randomBytes(32).toString("hex");
    const path = (count: number) => `M0 0${Array.from({ length: count }, (_, i) => `L${(i * 7919) % 997} ${(i * 104729) % 991}`).join("")}Z`;
    const withPath = (count: number, pointed: boolean): BadgeDocument => ({
      ...createBadgeDocument(["Anna"]),
      logo: { d: path(count), viewWidth: 1000, viewHeight: 1000, placement: "left", heightMm: 12, ...(pointed && { originalId }) },
    });
    // Leta upp en logga som ryms utan hänvisningen men inte med den.
    let fits = 0;
    let tooLong = 6000;
    while (tooLong - fits > 1) {
      const middle = Math.floor((fits + tooLong) / 2);
      if ((await encodeShareCode(withPath(middle, false))).droppedLogo) tooLong = middle;
      else fits = middle;
    }
    assert.ok(fits > 0, "hittade ingen logga på gränsen");
    const doc = withPath(fits, true);
    const { code, droppedLogo } = await encodeShareCode(doc);
    assert.equal(droppedLogo, false);
    assert.ok(code.length <= SHARE_MAX_CHARS);
    const shared = await decodeShareCode(code);
    assert.equal(shared?.logo?.d, doc.logo?.d);
    assert.equal(shared?.logo?.originalId, undefined);
  });

  it("en logga i färg som ligger i själva skylten är för stor för länken och tas bort", async () => {
    // Slumpartat innehåll, som en riktig PNG: det går inte att komprimera.
    const noise = randomBytes(30_000).toString("base64");
    const doc: BadgeDocument = {
      ...createBadgeDocument(["Anna"]),
      logo: { d: "M0 0L10 0L10 10L0 10Z", viewWidth: 10, viewHeight: 10, placement: "top", heightMm: 8, image: { src: `data:image/png;base64,${noise}` } },
    };
    const { code, droppedLogo } = await encodeShareCode(doc);
    assert.equal(droppedLogo, true);
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
