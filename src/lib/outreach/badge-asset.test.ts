import assert from "node:assert/strict";
import { writeFile, mkdir } from "node:fs/promises";
import { describe, test } from "node:test";
import sharp from "sharp";
import { BLANKS, badgeDocumentSchema, blankOf, getMaterial, isOfferedDocument } from "@/engine";
import { loadNodeFontEngine } from "@/lib/fonts/load-node";
import {
  assetIdFromPath,
  assetPath,
  newAssetId,
  badgeCaption,
  badgeForLead,
  badgeCompanyName,
  engravedName,
  personaBadgeName,
  heroJpeg,
  HERO_CHOICE,
  HERO_MATERIAL,
  MAX_HERO_BYTES,
  tileChoices,
  tileJpeg,
  tileLabel,
} from "./badge-asset";
import { dataUrlBytes, enclosedDetailMask, traceLogoBuffer } from "./trace-logo-server";

const lead = { contactName: "Anna Lindqvist", companyName: "Profilab AB" };

async function fixtureLogo(): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="120"><rect width="300" height="120" fill="#fff"/><rect x="20" y="20" width="80" height="80" fill="#003366"/><circle cx="200" cy="60" r="40" fill="#003366"/></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

describe("skylten för ett lead", () => {
  test("dokumentet klarar schemat och färgen finns i materialet", () => {
    const { doc } = badgeForLead(lead, null);
    assert.ok(badgeDocumentSchema.safeParse(doc).success);
    assert.ok(getMaterial(doc.materialId).colors.some((c) => c.id === doc.colorId));
    assert.deepEqual(
      doc.rows.map((r) => r.text),
      ["Anna Lindqvist", "Profilab AB"],
    );
  });

  test("mejlets skylt och alla rutor går att beställa och tillverkas av Skylt & Gravyrteknik", () => {
    assert.equal(getMaterial(HERO_MATERIAL).producer, "skylt-gravyr");
    assert.equal(isOfferedDocument(badgeForLead(lead, null).doc), true);
    for (const choice of tileChoices()) {
      const { doc } = badgeForLead(lead, null, choice);
      assert.ok(badgeDocumentSchema.safeParse(doc).success, choice.colorId);
      assert.equal(isOfferedDocument(doc), true, `${choice.colorId}/${choice.blankId}`);
      assert.equal(blankOf(doc)?.id, choice.blankId);
    }
  });

  test("rutorna visar alla fyra former och alla tre ytor, med mejlets skylt först", () => {
    const tiles = tileChoices();
    assert.deepEqual(tiles[0], HERO_CHOICE);
    assert.deepEqual(new Set(tiles.map((t) => t.blankId)), new Set(BLANKS.map((b) => b.id)));
    assert.deepEqual(
      new Set(tiles.map((t) => t.colorId)),
      new Set(getMaterial(HERO_MATERIAL).colors.map((c) => c.id)),
    );
  });

  test("rutan heter efter yta och form; en äldre ruta efter sitt material", () => {
    const { doc } = badgeForLead(lead, null, { colorId: "metal-silver", blankId: "oval" });
    assert.equal(tileLabel({ ...doc, ...doc.size }), "Borstat silver, oval");
    const old = { shape: "rounded" as const, widthMm: 70, heightMm: 25 };
    assert.equal(tileLabel({ ...old, materialId: "plastic-2-layer", colorId: "white-black" }), "Gravyrplast, Vit / Svart");
    assert.equal(tileLabel({ ...old, materialId: "stainless", colorId: "steel-laser" }), "Rostfritt stål");
  });

  test("en e-postadress eller ett för kort namn graveras inte", () => {
    assert.equal(engravedName("anna@profilab.se"), null);
    assert.equal(engravedName("A"), null);
    assert.equal(engravedName("  Anna   Lindqvist "), "Anna Lindqvist");
    const { doc } = badgeForLead({ ...lead, contactName: "anna@profilab.se" }, null);
    assert.deepEqual(
      doc.rows.map((r) => r.text),
      ["Profilab AB"],
    );
  });

  test("bildtexten nämner material, yta och skyltens egna mått", () => {
    const { doc } = badgeForLead(lead, null);
    assert.equal(badgeCaption({ ...doc, ...doc.size }), "metall, borstat guld, 75 × 25 mm");
    // En äldre bild får sin egen text, inte dagens mått.
    assert.equal(
      badgeCaption({ materialId: "plastic-2-layer", colorId: "darkblue-white", widthMm: 70, heightMm: 25 }),
      "gravyrplast, mörkblå / vit, 70 × 25 mm",
    );
  });

  test("en enkel PNG spåras till en bana och hamnar på skylten", async () => {
    const traced = await traceLogoBuffer(await fixtureLogo());
    assert.ok(traced);
    assert.match(traced.d, /^M/);
    const badge = badgeForLead(lead, traced);
    assert.equal(badge.logoStatus, "logo");
    assert.ok(badge.doc.logo);
  });

  test("ljus text inne i en genomskinlig sköld blir hål, inte en massiv form", async () => {
    const shield = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><path d="M20 20H180V110Q180 170 100 190Q20 170 20 110Z" fill="#003366"/><rect x="60" y="70" width="80" height="20" fill="#ffffff"/><rect x="60" y="110" width="80" height="20" fill="#ffffff"/></svg>`;
    const png = await sharp(Buffer.from(shield)).png().toBuffer();
    const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const mask = enclosedDetailMask({ data, width: info.width, height: info.height });
    assert.ok(mask);
    assert.equal(mask[80 * info.width + 100], 0, "texten är ett hål");
    assert.equal(mask[40 * info.width + 100], 1, "skölden är bläck");
    const traced = await traceLogoBuffer(png);
    assert.ok(traced);
    assert.ok((traced.d.match(/M/g) ?? []).length >= 3, "skölden plus två hål");
  });

  test("ord i olika färger på genomskinligt behålls som bläck", async () => {
    const words = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="80"><rect x="10" y="20" width="120" height="40" fill="#003366"/><rect x="160" y="20" width="60" height="40" fill="#dddddd"/></svg>`;
    const png = await sharp(Buffer.from(words)).png().toBuffer();
    const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.equal(enclosedDetailMask({ data, width: info.width, height: info.height }), null);
  });

  test("en trasig bild ger ingen logga", async () => {
    assert.equal(await traceLogoBuffer(Buffer.from("inte en bild")), null);
    assert.equal(dataUrlBytes("https://example.com/logo.png"), null);
    assert.ok(dataUrlBytes("data:image/png;base64,iVBORw0KGgo="));
  });
});

describe("bildadressen", () => {
  test("id:t går fram och tillbaka och vägrar sökvägstrick", () => {
    const id = newAssetId();
    assert.equal(assetIdFromPath(assetPath(id).split("/").at(-1) ?? ""), id);
    assert.equal(assetIdFromPath("..%2F..%2Fetc"), null);
    assert.equal(assetIdFromPath("kort.jpg"), null);
  });
});

describe("bilderna", () => {
  test("hjältebilden är en JPEG under taket", async () => {
    const fonts = await loadNodeFontEngine();
    const traced = await traceLogoBuffer(await fixtureLogo());
    const hero = await heroJpeg(badgeForLead(lead, traced).doc, fonts);
    assert.equal(hero.bytes[0], 0xff);
    assert.equal(hero.bytes[1], 0xd8);
    assert.ok(hero.bytes.length <= MAX_HERO_BYTES, `${hero.bytes.length} byte`);
    assert.ok(hero.width === 1200 || hero.width === 1000);
    await mkdir("tmp", { recursive: true });
    await writeFile("tmp/badge-asset-hero.jpg", hero.bytes);
  });

  test("materialrutan är en liten JPEG", async () => {
    const fonts = await loadNodeFontEngine();
    const tile = await tileJpeg(badgeForLead(lead, null, { colorId: "metal-silver", blankId: "cushion" }).doc, fonts);
    assert.equal(tile.width, 560);
    assert.ok(tile.bytes.length < 60 * 1024);
  });
});

describe("personaBadgeName", () => {
  test("personbilden bär bara förnamnet", () => {
    assert.equal(personaBadgeName("Anna Lindqvist"), "Anna");
    assert.equal(personaBadgeName("  Per-Olof  af Trolle "), "Per-Olof");
  });

  test("utan riktigt namn blir det bara företaget", () => {
    assert.equal(personaBadgeName(null), null);
    assert.equal(personaBadgeName("anna@profilab.se"), null);
    const doc = badgeForLead({ contactName: personaBadgeName("Anna Lindqvist"), companyName: "Profilab AB" }, null).doc;
    assert.doesNotMatch(JSON.stringify(doc), /Lindqvist/);
    assert.match(JSON.stringify(doc), /Anna/);
  });
});

describe("badgeCompanyName", () => {
  const maxChars = 40;

  test("ett namn som ryms lämnas orört", () => {
    assert.equal(badgeCompanyName("  Profilab   AB "), "Profilab AB");
  });

  test("ett för långt namn tappar bolagsformen", () => {
    const long = "Nordiska Företagsprofileringsbolaget Öst AB";
    assert.ok(long.length > maxChars);
    assert.equal(badgeCompanyName(long), "Nordiska Företagsprofileringsbolaget Öst");
  });

  test("räcker inte det kapas namnet vid ett helt ord", () => {
    const short = badgeCompanyName("Nordiska Företagsprofileringsbolaget Östra Götaland AB");
    assert.equal(short, "Nordiska Företagsprofileringsbolaget");
    assert.equal(badgeCompanyName("x".repeat(60)).length, maxChars);
  });

  test("skylten för ett långt företagsnamn klarar schemat", () => {
    const { doc } = badgeForLead(
      { contactName: "Anna Lindqvist", companyName: "Nordiska Företagsprofileringsbolaget Öst AB" },
      null,
    );
    assert.deepEqual(doc.rows.map((row) => row.text), ["Anna Lindqvist", "Nordiska Företagsprofileringsbolaget Öst"]);
  });

  test("ett namn som inte ryms på en rad graveras inte", () => {
    assert.equal(engravedName("A".repeat(maxChars + 1)), null);
  });
});
