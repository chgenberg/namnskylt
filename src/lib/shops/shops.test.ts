import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_COMPANY } from "@/lib/company/profile";
import { googleFontsHref, pickFontFamily, readableTextColor, shopSchema, shopThemeVars, slugify } from "./model";

describe("slugify", () => {
  it("gör korta adresser utan å, ä, ö och bolagsform", () => {
    assert.equal(slugify("Åsa & Co Profil AB"), "asa-co-profil");
    assert.equal(slugify("Quickbutton"), "quickbutton");
    assert.equal(slugify("Skylt & Gravyrteknik i Göteborg AB"), "skylt-gravyrteknik-i-goteborg");
    assert.equal(slugify("!!!"), "butik");
  });
});

describe("pickFontFamily", () => {
  it("hoppar över system-, ikon- och reservtypsnitt", () => {
    assert.equal(pickFontFamily(["-apple-system", "Font Awesome 6 Free", "'Inter'", "sans-serif"]), "Inter");
    assert.equal(pickFontFamily(["var(--font)", "Arial", "Helvetica"]), null);
    assert.equal(pickFontFamily(['"Playfair Display"']), "Playfair Display");
  });

  it("ger versaler åt familjer skrivna med gemener", () => {
    assert.equal(pickFontFamily(["open sans"]), "Open Sans");
    assert.equal(pickFontFamily(["DM Sans"]), "DM Sans");
  });

  it("tål familjer som inte är text", () => {
    assert.equal(pickFontFamily([null, { family: "x" }, "Inter"]), "Inter");
  });

  it("släpper inte igenom tecken som kan bryta CSS", () => {
    assert.equal(pickFontFamily(['Evil"; } body{display:none']), null);
  });
});

describe("butikens tema", () => {
  const shop = { profile: { ...DEFAULT_COMPANY, primaryColor: "#ef3a37", accentColor: "#111111" }, font: { family: "Inter", google: true } };

  it("byter sajtens färgtokens mot butikens", () => {
    const vars = shopThemeVars(shop);
    assert.equal(vars["--color-navy"], "#ef3a37");
    assert.equal(vars["--color-navy-tint"], "#fdebeb");
    assert.equal(vars["--shop-on"], "#ffffff");
    assert.match(vars["--font-sans"] ?? "", /^"Inter", /);
  });

  it("ger mörk text på ljus färg och låter typsnittet vara utan eget", () => {
    const vars = shopThemeVars({ ...shop, profile: { ...shop.profile, primaryColor: "#ffd200" }, font: { family: null, google: false } });
    assert.equal(vars["--shop-on"], "#0a0a0b");
    assert.equal(vars["--font-sans"], undefined);
  });

  it("mörkar ljusa färger tills de går att läsa som text, men lämnar mörka orörda", () => {
    assert.equal(readableTextColor("#0b1f3a"), "#0b1f3a");
    const yellow = readableTextColor("#ffe100");
    assert.notEqual(yellow, "#ffe100");
    const linear = (hex: string, i: number) => {
      const v = parseInt(hex.slice(i, i + 2), 16) / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    const lum = (hex: string) => 0.2126 * linear(hex, 1) + 0.7152 * linear(hex, 3) + 0.0722 * linear(hex, 5);
    assert.ok(1.05 / (lum(yellow) + 0.05) >= 4.5);
  });

  it("länkar Google Fonts med plus för mellanslag", () => {
    assert.equal(
      googleFontsHref("Playfair Display"),
      "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700&display=swap",
    );
  });

  it("validerar sparade butiker", () => {
    const ok = { slug: "quickbutton", profile: DEFAULT_COMPANY, font: { family: null, google: false }, sourceUrl: "quickbutton.se", createdAt: "2026-10-27T14:00:00Z" };
    assert.equal(shopSchema.safeParse(ok).success, true);
    assert.equal(shopSchema.safeParse({ ...ok, slug: "Quick Button" }).success, false);
  });
});
