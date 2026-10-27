import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractContacts, mergeContacts } from "./contacts";
import { companyFooter, companyProfileSchema, DEFAULT_COMPANY, readableOn } from "./profile";

describe("extractContacts", () => {
  it("läser länkar och löptext", () => {
    const html = `<footer><a href="mailto:info@fyren.se">Mejla</a> <a href="tel:+46317001234">Ring</a>
      <p>Restaurang Fyren AB · Org.nr: 559012-3456</p><p>Hamngatan 4, 411 14 Göteborg</p>
      <img src="logo@2x.png"></footer>`;
    assert.deepEqual(extractContacts(html), {
      email: "info@fyren.se",
      phone: "+46317001234",
      orgNumber: "559012-3456",
      address: "Hamngatan 4\n411 14 Göteborg",
    });
  });

  it("föredrar strukturerad data", () => {
    const ld = {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "Organization",
          email: "kontakt@kronan.se",
          telephone: "08-123 45 67",
          vatID: "SE556123456701",
          address: { streetAddress: "Storgatan 1", postalCode: "111 22", addressLocality: "Stockholm" },
        },
      ],
    };
    const html = `<script type="application/ld+json">${JSON.stringify(ld)}</script><p>annat@kronan.se</p>`;
    assert.deepEqual(extractContacts(html), {
      email: "kontakt@kronan.se",
      phone: "08-123 45 67",
      orgNumber: "556123-4567",
      address: "Storgatan 1\n111 22 Stockholm",
    });
  });

  it("tar bort nollan inom parentes i telefonnummer", () => {
    assert.equal(extractContacts(`<a href="tel:+46(0)70-3680473">Ring</a>`).phone, "+46 70-3680473");
  });

  it("tar inte personnummer eller bildnamn", () => {
    const found = extractContacts(`<p>Anna 850101-1234</p><img alt="hero@2x.png">`);
    assert.equal(found.orgNumber, null);
    assert.equal(found.email, null);
  });

  it("fyller luckor från nästa sida", () => {
    const merged = mergeContacts(
      { email: "a@b.se", phone: null, orgNumber: null, address: null },
      { email: "c@d.se", phone: "070-111 22 33", orgNumber: null, address: null },
    );
    assert.equal(merged.email, "a@b.se");
    assert.equal(merged.phone, "070-111 22 33");
  });
});

describe("companyProfileSchema", () => {
  it("godtar standardprofilen och normaliserar färger", () => {
    const parsed = companyProfileSchema.parse({ ...DEFAULT_COMPANY, primaryColor: "#0B1F3A" });
    assert.equal(parsed.primaryColor, "#0b1f3a");
  });

  it("stoppar SVG-loggor och ogiltiga färger", () => {
    assert.equal(companyProfileSchema.safeParse({ ...DEFAULT_COMPANY, logo: "data:image/svg+xml;base64,PHN2Zz4=" }).success, false);
    assert.equal(companyProfileSchema.safeParse({ ...DEFAULT_COMPANY, logo: "https://x.se/logo.png" }).success, false);
    assert.equal(companyProfileSchema.safeParse({ ...DEFAULT_COMPANY, primaryColor: "red" }).success, false);
    assert.equal(companyProfileSchema.safeParse({ ...DEFAULT_COMPANY, logo: "data:image/png;base64,iVBORw0KGgo=" }).success, true);
  });
});

describe("profilens hjälpare", () => {
  it("väljer läsbar textfärg", () => {
    assert.equal(readableOn("#0b1f3a"), "#ffffff");
    assert.equal(readableOn("#ffd200"), "#0a0a0b");
  });

  it("hoppar över tomma uppgifter i sidfoten", () => {
    assert.deepEqual(companyFooter({ ...DEFAULT_COMPANY, orgNumber: "556123-4567", address: "Storgatan 1\n111 22 Stockholm" }), [
      "namnskylt.com · Org.nr 556123-4567",
      "Storgatan 1, 111 22 Stockholm",
      "namnskylt.com",
    ]);
  });
});
