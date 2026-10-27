import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_COMPANY } from "@/lib/company/profile";
import { googleFontsHref, pickFontFamily, shopSchema, shopThemeVars, slugify } from "./model";

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
