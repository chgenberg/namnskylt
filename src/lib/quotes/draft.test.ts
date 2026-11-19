import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { approxFonts, createBadgeDocument, withTexts } from "@/engine";
import { endPriceTable } from "@/engine/price-model";
import { DEFAULT_PRICE_MODEL } from "@/engine/default-price-model";
import { DEFAULT_COMPANY } from "@/lib/company/profile";
import { quoteDocument, quoteHtml } from "./document";
import { DRAFT_QUOTE_NO, draftQuote, type QuoteDraftInput } from "./draft";
import { isValidUntil, parseQuoteOptions, parseQuoteShots, showsSellerLogo, storedQuoteOptions } from "./model";

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

describe("offertens delar, bilder och redigering", () => {
  const PIXEL = "data:image/webp;base64,AAAA";
  const second = { ...withTexts(createBadgeDocument(["Bo Ek"]), ["Bo Ek"]), materialId: "plastic" as const, colorId: "blue-white", quantity: 2 };

  it("varje del går att ta bort: moms, löften, svarsruta, villkor, säljarens uppgifter och bilder", () => {
    const full = quoteHtml(draftQuote(base), approxFonts, { ...seller, quoteTerms: "Betalning 30 dagar" });
    for (const part of ["Moms 25 %", 'class="promise"', 'class="accept"', "Betalning 30 dagar", 'class="seller"', 'class="gallery"']) assert.ok(full.includes(part), part);
    const bare = quoteHtml(
      draftQuote({ ...base, options: { vat: false, promises: false, accept: false, terms: false, seller: false, pictures: false } }),
      approxFonts,
      { ...seller, quoteTerms: "Betalning 30 dagar" },
    );
    for (const part of ["Moms 25 %", "Att betala inkl. moms", 'class="promise"', 'class="accept"', "Betalning 30 dagar", 'class="seller"', 'class="gallery"']) {
      assert.ok(!bare.includes(part), part);
    }
    // Summan och raderna står alltid kvar, och kundens uppgifter får hela bredden utan bilder.
    assert.ok(bare.includes("Totalt exkl. moms"));
    assert.ok(bare.includes('class="grid wide"'));
  });

  it("en design med bilder ur 3D-vyn får en stor bild och tre små med bildtext", () => {
    const shots = [{ main: PIXEL, angles: [PIXEL, PIXEL, PIXEL] }];
    const html = quoteHtml(draftQuote({ ...base, shots }), approxFonts, seller);
    assert.equal(html.split('<div class="gallery">').length - 1, 1);
    assert.ok(html.includes('<div class="hero photo"><img'));
    assert.equal(html.split("<figure>").length - 1, 3);
    for (const label of ["Framifrån", "Från sidan", "Baksidan"]) assert.ok(html.includes(`<figcaption>${label}</figcaption>`), label);
    // De små bilderna går att ta bort för sig.
    const plain = quoteHtml(draftQuote({ ...base, shots, options: { angles: false } }), approxFonts, seller);
    assert.ok(plain.includes('class="hero photo"') && !plain.includes('class="angles"'));
  });

  it("flera designer står två i bredd, var och en med sin bild, och utan bilder ritas ritningen", () => {
    const html = quoteHtml(draftQuote({ ...base, badges: [badge, second], shots: [{ main: PIXEL, angles: [PIXEL] }, null] }), approxFonts, seller);
    assert.ok(html.includes('<div class="designs">'));
    assert.equal(html.split('<div class="gallery">').length - 1, 2);
    assert.ok(html.includes("Design 1 · 10 st") && html.includes("Design 2 · 2 st"));
    assert.equal(html.split('class="hero photo"').length - 1, 1);
    assert.ok(html.includes('<div class="hero"><svg'));
  });

  it("en avslutande text står under summan", () => {
    const html = quoteHtml(draftQuote({ ...base, options: { closing: "Vi hörs <snart>." } }), approxFonts, seller);
    assert.ok(html.includes('<p class="closing">Vi hörs &lt;snart&gt;.</p>'));
    assert.ok(!quoteHtml(draftQuote(base), approxFonts, seller).includes('class="closing"'));
  });

  it("bara förhandsvisningen går att skriva i: det färdiga dokumentet har inga redigerbara fält", () => {
    const draft = draftQuote({ ...base, message: "" });
    const preview = quoteDocument(draft, approxFonts, seller, null, { editable: true, slots: { message: true, closing: true } });
    assert.ok(preview.body.includes('<h1 data-edit="project" contenteditable="true"'));
    assert.ok(preview.body.includes('data-edit="message"') && preview.body.includes('data-placeholder="Klicka för att skriva en hälsning"'));
    assert.ok(preview.body.includes('data-edit="closing"'));
    assert.ok(preview.body.includes('data-jump="validUntil"') && preview.body.includes('data-jump="customer"'));
    const printed = quoteHtml(draft, approxFonts, seller);
    for (const mark of ["contenteditable", "data-edit", "data-jump", "data-placeholder"]) assert.ok(!printed.includes(mark), mark);
    // En tom hälsning tar ingen plats i det färdiga dokumentet.
    assert.ok(!printed.includes('class="message"'));
  });
});

describe("offertens val", () => {
  it("läser delarna och den avslutande texten, och sparar bara det som avviker från förvalet", () => {
    assert.deepEqual(parseQuoteOptions({ logo: false, vat: true, okänd: false, closing: "  Hej  " }), { logo: false, vat: true, closing: "Hej" });
    assert.deepEqual(storedQuoteOptions({ logo: true, vat: false, closing: " " }), { vat: false });
    assert.equal(storedQuoteOptions({ logo: true }), null);
    assert.equal(storedQuoteOptions(null), null);
    assert.equal(parseQuoteOptions({ closing: "x".repeat(2000) }).closing?.length, 1000);
  });

  it("läser bilderna ur 3D-vyn bara när de är bilder, högst fyra designer med tre vinklar var", () => {
    const image = "data:image/webp;base64,AAAA";
    assert.deepEqual(parseQuoteShots([{ main: image, angles: [image, "javascript:alert(1)", image] }, null, { main: "http://exempel.se/x.png", angles: [] }]), [
      { main: image, angles: [image, image] },
      null,
      null,
    ]);
    assert.equal(parseQuoteShots(Array.from({ length: 9 }, () => ({ main: image, angles: [image, image, image, image] }))).length, 4);
    assert.equal(parseQuoteShots([{ main: image, angles: [image, image, image, image] }])[0]?.angles.length, 3);
    assert.deepEqual(parseQuoteShots("inget"), []);
  });


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
