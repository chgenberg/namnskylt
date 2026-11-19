import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { approxFonts, createBadgeDocument, withTexts } from "@/engine";
import { endPriceTable } from "@/engine/price-model";
import { DEFAULT_PRICE_MODEL } from "@/engine/default-price-model";
import { DEFAULT_COMPANY } from "@/lib/company/profile";
import { quoteHtml } from "./document";
import { DRAFT_QUOTE_NO, draftQuote, type QuoteDraftInput } from "./draft";
import { isValidUntil, parseQuoteOptions, showsSellerLogo } from "./model";

const badge = { ...withTexts(createBadgeDocument(["Anna Lind", "Säljare"]), ["Anna Lind", "Säljare"]), quantity: 10 };
const base: QuoteDraftInput = {
  badges: [badge],
  priceList: endPriceTable(DEFAULT_PRICE_MODEL),
  shippingSek: 159,
  customer: { company: "Exempel AB", name: "Kim Ek", email: "kim@exempel.se", phone: "", orgNumber: "556000-0000" },
  project: "Namnskyltar till butiken",
  message: "Hej! Här kommer offerten.",
  validUntil: "2026-12-19",
  options: {},
  badgeShot: null,
  now: new Date("2026-11-19T10:00:00Z"),
};
const seller = { ...DEFAULT_COMPANY, name: "Säljaren AB", logo: "data:image/png;base64,AAAA" };

describe("offertens förhandsvisning i skyltmotorn", () => {
  it("ritas ur ett utkast med listpris, frakten och kundens uppgifter", () => {
    const draft = draftQuote(base);
    assert.equal(draft.quoteNo, DRAFT_QUOTE_NO);
    assert.equal(draft.pricing, null);
    assert.equal(draft.shippingSek, 159);
    assert.ok(draft.totalSek > 159);
    assert.equal(draft.totalInclVatSek, Math.round(draft.totalSek * 1.25));
    const html = quoteHtml(draft, approxFonts, seller);
    for (const part of ["Exempel AB", "Kim Ek", "556000-0000", "Namnskyltar till butiken", "Hej! Här kommer offerten.", "19 december 2026", "10 st", "Frakt"]) {
      assert.ok(html.includes(part), part);
    }
  });

  it("säger att kunden svarar säljaren, eftersom offerten inte mejlas härifrån", () => {
    const html = quoteHtml(draftQuote(base), approxFonts, seller);
    assert.ok(html.includes("svara Säljaren AB att ni godkänner"));
    assert.ok(!html.includes("öppna länken i mejlet"));
    // En offert som har mejlats härifrån hänvisar till länken i mejlet, som förut.
    const mailed = quoteHtml({ ...draftQuote(base), emailedAt: "2026-11-19T10:00:00Z" }, approxFonts, seller);
    assert.ok(mailed.includes("öppna länken i mejlet"));
  });

  it("visar säljarens logga, och bara namnet när säljaren har valt bort den", () => {
    assert.ok(quoteHtml(draftQuote(base), approxFonts, seller).includes('<img class="logo"'));
    const without = quoteHtml(draftQuote({ ...base, options: { logo: false } }), approxFonts, seller);
    assert.ok(!without.includes('<img class="logo"'));
    assert.ok(without.includes('<div class="brand">Säljaren AB'));
  });

  it("går att rita innan kunden är vald och innan frakten är känd", () => {
    const draft = draftQuote({ ...base, customer: null, shippingSek: null, project: " ", message: "" });
    assert.equal(draft.customer.name, "Kunden");
    assert.equal(draft.project, null);
    assert.equal(draft.message, null);
    assert.equal(draft.shippingSek, 0);
    assert.ok(quoteHtml(draft, approxFonts, seller).includes("Namnskyltar till Kunden"));
  });
});

describe("offertens val", () => {
  it("läses bara när de går att läsa, och loggan visas om inget annat är valt", () => {
    assert.deepEqual(parseQuoteOptions({ logo: false }), { logo: false });
    assert.deepEqual(parseQuoteOptions({ logo: "nej" }), {});
    assert.deepEqual(parseQuoteOptions(null), {});
    assert.equal(showsSellerLogo({ options: {} }), true);
    assert.equal(showsSellerLogo({}), true);
    assert.equal(showsSellerLogo({ options: { logo: false } }), false);
  });

  it("dagen offerten gäller till är en riktig dag, från i dag och högst ett år fram", () => {
    assert.equal(isValidUntil("2026-11-19", "2026-11-19"), true);
    assert.equal(isValidUntil("2027-11-19", "2026-11-19"), true);
    assert.equal(isValidUntil("2026-11-18", "2026-11-19"), false);
    assert.equal(isValidUntil("2027-11-20", "2026-11-19"), false);
    assert.equal(isValidUntil("2026-13-40", "2026-11-19"), false);
    assert.equal(isValidUntil("i morgon", "2026-11-19"), false);
  });
});
