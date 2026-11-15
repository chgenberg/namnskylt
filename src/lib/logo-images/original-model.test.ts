import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createBadgeDocument, type BadgeDocument, type BadgeLogo } from "@/engine";
import {
  LOGO_ORIGINAL_MAX_BYTES,
  attachmentDisposition,
  cleanFileName,
  detectLogoFileType,
  downloadFileName,
  logoOriginalHref,
  referencedLogoOriginals,
  withoutLogoOriginals,
} from "./original-model";

const text = (value: string) => new TextEncoder().encode(value);
const bytes = (...values: number[]) => Uint8Array.from(values);
const pad = (head: Uint8Array, length = 64) => Uint8Array.from([...head, ...new Array<number>(length).fill(7)]);

describe("filtypen läses ur innehållet", () => {
  it("känner igen PNG, JPEG, WebP, GIF och PDF på sina första bytes", () => {
    assert.deepEqual(detectLogoFileType(pad(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))), { mime: "image/png", extension: "png" });
    assert.deepEqual(detectLogoFileType(pad(bytes(0xff, 0xd8, 0xff, 0xe0))), { mime: "image/jpeg", extension: "jpg" });
    assert.deepEqual(detectLogoFileType(pad(Uint8Array.from([...text("RIFF"), 1, 2, 3, 4, ...text("WEBPVP8 ")]))), { mime: "image/webp", extension: "webp" });
    assert.deepEqual(detectLogoFileType(pad(text("GIF89a"))), { mime: "image/gif", extension: "gif" });
    assert.deepEqual(detectLogoFileType(pad(text("%PDF-1.7\n"))), { mime: "application/pdf", extension: "pdf" });
  });

  it("känner igen en SVG med deklaration, kommentar, DOCTYPE och BOM före elementet", () => {
    assert.equal(detectLogoFileType(text('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>'))?.mime, "image/svg+xml");
    assert.equal(detectLogoFileType(text('\uFEFF<?xml version="1.0" encoding="UTF-8"?>\n<!-- Generator -->\n<svg viewBox="0 0 1 1"/>'))?.extension, "svg");
    const illustrator =
      '<?xml version="1.0"?>\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd" [\n  <!ENTITY ns_extend "http://ns.adobe.com/Extensibility/1.0/">\n]>\n<svg version="1.1">';
    assert.equal(detectLogoFileType(text(illustrator))?.mime, "image/svg+xml");
    assert.equal(detectLogoFileType(text("  \n<SVG>"))?.mime, "image/svg+xml");
  });

  it("vägrar allt annat, vad det än utger sig för", () => {
    assert.equal(detectLogoFileType(new Uint8Array()), null);
    assert.equal(detectLogoFileType(text("<html><body><svg></svg></body></html>")), null);
    assert.equal(detectLogoFileType(text('<script>alert(1)</script><svg/>')), null);
    assert.equal(detectLogoFileType(text("svg")), null);
    assert.equal(detectLogoFileType(text("Bara text om <svg> i en mening")), null);
    assert.equal(detectLogoFileType(text("<svgx>")), null);
    // En körbar fil, ett zip-arkiv och en binär fil som råkar börja som en SVG.
    assert.equal(detectLogoFileType(pad(bytes(0x4d, 0x5a, 0x90, 0x00))), null);
    assert.equal(detectLogoFileType(pad(bytes(0x50, 0x4b, 0x03, 0x04))), null);
    assert.equal(detectLogoFileType(Uint8Array.from([...text("<svg>"), 0, 1, 2, 3])), null);
    // RIFF är också ljud och video: bara WebP tas emot.
    assert.equal(detectLogoFileType(pad(Uint8Array.from([...text("RIFF"), 1, 2, 3, 4, ...text("WAVEfmt ")]))), null);
  });

  it("taket är tio megabyte", () => {
    assert.equal(LOGO_ORIGINAL_MAX_BYTES, 10 * 1024 * 1024);
  });
});

describe("filens namn", () => {
  it("sparas utan sökväg, styrtecken och tecken som betyder något i ett huvud", () => {
    assert.equal(cleanFileName("Logga Företaget AB.svg"), "Logga Företaget AB.svg");
    assert.equal(cleanFileName("C:\\Users\\anna\\Skrivbord\\logga.png"), "logga.png");
    assert.equal(cleanFileName("../../etc/passwd"), "passwd");
    assert.equal(cleanFileName('lo"gga\r\nSet-Cookie: x=1.png'), "loggaSet-Cookie x=1.png");
    assert.equal(cleanFileName("...dold.svg"), "dold.svg");
    assert.equal(cleanFileName("a".repeat(400))?.length, 120);
    assert.equal(cleanFileName("   "), null);
    assert.equal(cleanFileName(null), null);
    assert.equal(cleanFileName(undefined), null);
  });

  it("laddas ner med ändelsen som hör till filens verkliga typ", () => {
    const id = "ab".repeat(32);
    assert.equal(downloadFileName(id, "Logga AB.svg", "image/svg+xml"), "Logga AB.svg");
    // Filen påstods vara en PNG men är en SVG.
    assert.equal(downloadFileName(id, "logga.png", "image/svg+xml"), "logga.svg");
    assert.equal(downloadFileName(id, "logga.final.JPEG", "image/jpeg"), "logga.final.jpg");
    assert.equal(downloadFileName(id, "logga-fran-hemsidan", "image/png"), "logga-fran-hemsidan.png");
    assert.equal(downloadFileName(id, null, "application/pdf"), "logga-abababab.pdf");
    assert.equal(downloadFileName(id, ".svg", "image/svg+xml"), "logga-abababab.svg");
    assert.equal(downloadFileName(id, "logga", "text/html"), "logga.bin");
  });

  it("skickas alltid som nedladdning, med ett namn som inte kan bryta huvudet", () => {
    assert.equal(attachmentDisposition("logga.svg"), `attachment; filename="logga.svg"; filename*=UTF-8''logga.svg`);
    const swedish = attachmentDisposition("Företagets logga (ny).png");
    assert.ok(swedish.startsWith(`attachment; filename="Foretagets logga (ny).png"; `));
    assert.ok(swedish.endsWith("filename*=UTF-8''F%C3%B6retagets%20logga%20%28ny%29.png"));
    const hostile = attachmentDisposition('a"b\\c.png');
    assert.ok(hostile.startsWith(`attachment; filename="a_b_c.png"; `));
    assert.ok(!/[\r\n]/.test(hostile));
  });

  it("hämtas på en adress med filens id", () => {
    assert.equal(logoOriginalHref("0f".repeat(32)), `/api/logo-originals/${"0f".repeat(32)}`);
  });
});

describe("hänvisningarna i en order", () => {
  const logo: BadgeLogo = { d: "M0 0L10 0L10 10L0 10Z", viewWidth: 10, viewHeight: 10, placement: "left", heightMm: 12 };
  const a = "a1".repeat(32);
  const b = "b2".repeat(32);
  const badge = (name: string, originalId?: string): BadgeDocument => ({
    ...createBadgeDocument([name]),
    logo: { ...logo, ...(originalId && { originalId }) },
  });
  const badges = [badge("Anna", a), badge("Bo", a), badge("Cia"), badge("Dan", b), createBadgeDocument(["Eva"])];

  it("läses ut en gång per fil, i skyltarnas ordning", () => {
    assert.deepEqual(referencedLogoOriginals(badges), [a, b]);
    assert.deepEqual(referencedLogoOriginals([]), []);
    // Ett id som inte är en SHA-256 är ingen hänvisning.
    assert.deepEqual(referencedLogoOriginals([badge("Fia", "../admin")]), []);
  });

  it("tas bort där de pekas ut, utan att något annat i skylten ändras", () => {
    const cleaned = withoutLogoOriginals(badges, (id) => id === a);
    assert.deepEqual(referencedLogoOriginals(cleaned), [b]);
    assert.deepEqual(cleaned[0], badge("Anna"));
    assert.equal("originalId" in (cleaned[0]?.logo ?? {}), false);
    // Skyltar som inte berörs är samma objekt som förut.
    assert.equal(cleaned[2], badges[2]);
    assert.equal(cleaned[3], badges[3]);
    assert.equal(cleaned[4], badges[4]);
    assert.equal(badges[0]?.logo?.originalId, a);
  });
});
