import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_COMPANY } from "@/lib/company/profile";
import type { Shop } from "@/lib/shops/model";
import { buildShopEmail } from "./shop-email";

const shop: Shop = {
  slug: "profil-ab",
  profile: { ...DEFAULT_COMPANY, name: "Profil & <Co>", primaryColor: "#ef3a37", accentColor: "#1f2937" },
  font: { family: null, google: false },
  sourceUrl: "profil.se",
  createdAt: "2026-10-27T15:00:00Z",
};

const email = buildShopEmail({
  shop,
  shopUrl: "https://www.namnskylt.com/butik/profil-ab",
  mockupUrl: "https://www.namnskylt.com/butik/profil-ab/mejlbild",
  logoUrl: "https://www.namnskylt.com/butik/profil-ab/logo",
  logoPlate: null,
  sender: { ...DEFAULT_COMPANY, phone: "070-123 45 67" },
  unsubscribeUrl: "https://www.namnskylt.com/avregistrera",
});

describe("mejlet till återförsäljaren", () => {
  it("är personligt och escapar namnet", () => {
    assert.equal(email.subject, "Profil & <Co>, er egen namnskyltsbutik är redan byggd");
    assert.match(email.html, /Hej Profil &amp; &lt;Co&gt;!/);
    assert.doesNotMatch(email.html, /<Co>/);
  });

  it("länkar till butiken med spårning per butik", () => {
    assert.match(email.html, /utm_campaign=demobutik/);
    assert.match(email.html, /utm_content=profil-ab-knapp/);
    assert.match(email.text, /Öppna er butik: https:\/\/www\.namnskylt\.com\/butik\/profil-ab\?/);
  });

  it("har bara bildadresser, knapp för Outlook och mörkt läge", () => {
    assert.doesNotMatch(email.html, /src="data:/);
    assert.match(email.html, /v:roundrect/);
    assert.match(email.html, /prefers-color-scheme:dark/);
    assert.match(email.html, /fillcolor="#ef3a37"/);
  });

  it("har avregistrering i både HTML och text", () => {
    assert.match(email.html, /avregistrera/);
    assert.match(email.text, /Vill inte ha fler mejl: https:\/\/www\.namnskylt\.com\/avregistrera/);
  });
});
