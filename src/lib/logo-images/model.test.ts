import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createBadgeDocument, logoImageRef, withTexts, type BadgeDocument } from "@/engine";
import { embeddedLogoImages, pngBytes, pngDataUrl, referencedLogoImages, replaceLogoImages } from "./model";

/** En giltig 1 × 1 px PNG. */
const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const REF = logoImageRef("5c".repeat(32));
const logo = { d: "M0 0L10 0L10 10L0 10Z", viewWidth: 10, viewHeight: 10, placement: "top" as const, heightMm: 8 };

function badge(name: string, src?: string): BadgeDocument {
  return { ...createBadgeDocument([name]), logo: { ...logo, ...(src && { image: { src } }) } };
}

describe("bilden i en data-URL", () => {
  it("läses till bytes och tillbaka utan att ändras", () => {
    const bytes = pngBytes(PNG);
    assert.ok(bytes);
    assert.deepEqual([...bytes.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    assert.equal(pngDataUrl(bytes), PNG);
  });

  it("annat än en PNG i base64 ger null", () => {
    for (const src of ["", REF, "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=", "data:image/png;base64,", "https://example.se/a.png"]) {
      assert.equal(pngBytes(src), null, src);
    }
  });
});

describe("loggans bild i en order", () => {
  /** Hundra namn med samma logga, som i en order från skyltmotorn. */
  const order = Array.from({ length: 100 }, (_, i) => withTexts(badge("Anna", PNG), [`Person ${i}`]));

  it("hundra skyltar med samma logga är en enda bild att spara", () => {
    assert.deepEqual(embeddedLogoImages(order), [PNG]);
    assert.deepEqual(referencedLogoImages(order), []);
  });

  it("efter sparandet pekar alla skyltar på samma bild, och ordern blir liten", () => {
    const stored = replaceLogoImages(order, (src) => (src === PNG ? REF : undefined));
    assert.ok(stored.every((doc) => doc.logo?.image?.src === REF));
    assert.deepEqual(embeddedLogoImages(stored), []);
    assert.deepEqual(referencedLogoImages(stored), ["5c".repeat(32)]);
    // Allt annat i skyltarna är orört.
    assert.deepEqual(
      stored.map((doc) => ({ ...doc, logo: { ...doc.logo, image: { src: PNG } } })),
      order,
    );
    assert.ok(JSON.stringify(stored).length < JSON.stringify(order).length);
  });

  it("skyltar utan bild, och bilder utan ny källa, lämnas som samma objekt", () => {
    const engraved = badge("Erik");
    const colored = badge("Sara", PNG);
    const [first, second] = replaceLogoImages([engraved, colored], () => undefined);
    assert.equal(first, engraved);
    assert.equal(second, colored);
    assert.deepEqual(embeddedLogoImages([engraved]), []);
  });

  it("skiljer bilder i skylten från bilder på servern", () => {
    const mixed = [badge("A", PNG), badge("B", REF), badge("C", REF), badge("D")];
    assert.deepEqual(embeddedLogoImages(mixed), [PNG]);
    assert.deepEqual(referencedLogoImages(mixed), ["5c".repeat(32)]);
  });
});
