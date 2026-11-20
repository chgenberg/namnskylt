import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { approxFonts, createBadgeDocument, toOfferedDocument } from "@/engine";
import { DEFAULT_PRICE_MODEL } from "@/engine/default-price-model";
import { endPriceTable } from "@/engine/price-model";
import { DEFAULT_COMPANY } from "@/lib/company/profile";
import { quoteHtml } from "./document";
import { draftQuote, type QuoteDraftInput } from "./draft";
import { hasQuoteParty, parseQuoteRequester, quoteCustomerLabel } from "./model";
import { quoteAllBadges, quoteGalleries, quoteHeading, quoteInfoRows, quoteSellerLines, quoteTermsLines } from "./view";

/** En PNG på en pixel: bilderna ur 3D-vyn är data-URL:er. */
const PIXEL = "data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==";
const seller = { ...DEFAULT_COMPANY, name: "Säljaren AB", orgNumber: "556000-0000", email: "info@saljaren.exempel.se", quoteTerms: "Betalning 30 dagar netto." };
const badge = { ...toOfferedDocument(createBadgeDocument(["Anna Lind", "Säljare"])), quantity: 2 };
const second = { ...toOfferedDocument(createBadgeDocument(["Bo Ek", "Säljare"])), quantity: 1 };
const base: QuoteDraftInput = {
  badges: [badge, second],
  priceList: endPriceTable(DEFAULT_PRICE_MODEL),
  shippingSek: 75,
  customer: { company: "Kund AB", name: "Kim Ek", email: "kim@exempel.se", phone: "", orgNumber: "556123-4567" },
  project: "",
  message: "Hej Kim!",
  validUntil: "2026-12-20",
  options: { closing: "Hör av er vid frågor." },
  badgeShot: null,
  shots: [{ main: PIXEL, angles: [PIXEL, PIXEL, PIXEL] }],
  now: new Date("2026-11-20T09:00:00Z"),
};

describe("en offert som kunden har laddat ner själv, utan kund i registret", () => {
  // Kundens egen offert har aldrig en kund i registret när den ritas i skyltmotorn.
  const own = (customer: QuoteDraftInput["customer"]) => draftQuote({ ...base, customer, noCustomer: true, byCustomer: true });

  it("utan uppgifter har den inga kundrader, och rubriken nämner ingen", () => {
    const quote = own(null);
    assert.equal(hasQuoteParty(quote), false);
    assert.deepEqual(quoteHeading(quote), { eyebrow: "Offert", title: "Namnskyltar" });
    assert.deepEqual(
      quoteInfoRows(quote, seller).map((row) => row.label),
      ["Offertdatum", "Giltig till"],
    );
    assert.equal(quoteCustomerLabel(quote), "Utan kund");
    assert.ok(!quoteHtml(quote, approxFonts, seller).includes("Kunden"));
  });

  it("det kunden skriver om sig själv står på den, också bara ett företagsnamn", () => {
    const quote = own({ company: "Kund AB", name: "", email: "", phone: "", orgNumber: "" });
    assert.equal(hasQuoteParty(quote), true);
    assert.equal(quoteHeading(quote).title, "Namnskyltar till Kund AB");
    assert.deepEqual(
      quoteInfoRows(quote, seller).map((row) => [row.label, row.value]).slice(0, 1),
      [["Kund", "Kund AB"]],
    );
    assert.equal(quoteCustomerLabel(quote), "Kund AB");
    const full = own(base.customer);
    assert.equal(Object.fromEntries(quoteInfoRows(full, seller).map((row) => [row.label, row.value])).Kontakt, "Kim Ek · kim@exempel.se");
  });

  it("ett utkast som säljaren sparade utan kund ritas som förut, utan kundrader", () => {
    const draft = draftQuote({ ...base, customer: null, noCustomer: true });
    assert.equal(hasQuoteParty(draft), false);
    assert.equal(quoteHeading(draft).title, "Namnskyltar");
  });

  it("det kunden skrev rensas, och inget ifyllt är inget alls", () => {
    assert.equal(parseQuoteRequester({}), null);
    assert.equal(parseQuoteRequester({ company: "   ", name: "" }), null);
    assert.equal(parseQuoteRequester("x"), null);
    assert.deepEqual(parseQuoteRequester({ company: "  Kund   AB ", email: "Kim@Exempel.SE", annat: "bort", name: 7 }), {
      company: "Kund AB",
      name: "",
      email: "kim@exempel.se",
      orgNumber: "",
    });
    assert.equal(parseQuoteRequester({ company: "x".repeat(300) })?.company.length, 120);
  });
});

describe("det offerten säger, för både PDF:en och kundens offertsida", () => {
  it("rubriken är densamma i båda: projektet, annars Namnskyltar till kunden", () => {
    assert.deepEqual(quoteHeading(draftQuote(base)), { eyebrow: "Offert", title: "Namnskyltar till Kund AB" });
    assert.deepEqual(quoteHeading(draftQuote({ ...base, project: "Skyltar till mässan" })), { eyebrow: "Offert till Kund AB", title: "Skyltar till mässan" });
    assert.deepEqual(quoteHeading(draftQuote({ ...base, customer: null, noCustomer: true })), { eyebrow: "Offert", title: "Namnskyltar" });
  });

  it("kundens rader och dagarna, i PDF:ens ordning", () => {
    const rows = quoteInfoRows(draftQuote(base), seller);
    assert.deepEqual(
      rows.map((row) => [row.label, row.value]),
      [
        ["Kund", "Kund AB"],
        ["Org.nr", "556123-4567"],
        ["Kontakt", "Kim Ek · kim@exempel.se"],
        ["Offertdatum", "20 november 2026"],
        ["Giltig till", "20 december 2026"],
      ],
    );
    // Ska skyltarna till säljaren står bara säljarens namn, aldrig adressen.
    const toSeller = quoteInfoRows({ ...draftQuote(base), delivery: { to: "reseller", address: { name: "Säljaren AB", contactName: null, line1: "Hemliga gatan 1", line2: null, zip: "111 11", city: "Staden", country: "SE", phone: null } } }, seller);
    assert.deepEqual(toSeller.find((row) => row.label === "Leverans")?.value, "Till Säljaren AB");
    assert.ok(!JSON.stringify(toSeller).includes("Hemliga gatan"));
  });

  it("kundens inköpsnummer står bland raderna när det är ifyllt", () => {
    assert.ok(!quoteInfoRows(draftQuote(base), seller).some((row) => row.label === "Inköpsnummer"));
    const rows = quoteInfoRows(draftQuote({ ...base, customerPo: " 4500 012345 " }), seller);
    assert.deepEqual(rows.find((row) => row.label === "Inköpsnummer")?.value, "4500 012345");
    assert.ok(quoteHtml(draftQuote({ ...base, customerPo: "4500 012345" }), approxFonts, seller).includes('<p class="k">Inköpsnummer</p><p class="v">4500 012345</p>'));
  });

  it("bilderna följer säljarens val: stor bild, vinklar med bildtext, eller inga alls", () => {
    const [gallery] = quoteGalleries(draftQuote(base));
    assert.ok(gallery);
    assert.equal(gallery.main, PIXEL);
    assert.deepEqual(gallery.angles.map((angle) => angle.label), ["Framifrån", "Från sidan", "Baksidan"]);
    assert.equal(gallery.note, "Visas med första namnet — alla 2 namn står nedan");
    assert.deepEqual(quoteGalleries(draftQuote({ ...base, options: { angles: false } }))[0]?.angles, []);
    assert.deepEqual(quoteGalleries(draftQuote({ ...base, options: { pictures: false } })), []);
    // Utan bilder ur 3D-vyn ritas designen som ritning.
    assert.equal(quoteGalleries(draftQuote({ ...base, shots: [] }))[0]?.main, null);
  });

  it("alla skyltar visas när en design har flera namn, om säljaren inte har valt bort rutan", () => {
    assert.equal(quoteAllBadges(draftQuote(base))?.badges.length, 2);
    assert.equal(quoteAllBadges(draftQuote({ ...base, badges: [badge] })), null);
    assert.equal(quoteAllBadges(draftQuote({ ...base, options: { badges: false } })), null);
  });

  it("villkoren och säljarens uppgifter följer säljarens val", () => {
    const quote = draftQuote(base);
    assert.deepEqual(quoteTermsLines(quote, seller), ["Offerten gäller till 20 december 2026.", "Betalning 30 dagar netto."]);
    assert.ok(quoteSellerLines(quote, seller).some((line) => line.includes("Säljaren AB")));
    const bare = draftQuote({ ...base, options: { terms: false, seller: false } });
    assert.deepEqual(quoteTermsLines(bare, seller), []);
    assert.deepEqual(quoteSellerLines(bare, seller), []);
  });

  it("PDF:en ritas ur samma delar", () => {
    const quote = draftQuote(base);
    const html = quoteHtml(quote, approxFonts, seller);
    assert.ok(html.includes(`>${quoteHeading(quote).title}</h1>`));
    for (const row of quoteInfoRows(quote, seller)) assert.ok(html.includes(`<p class="k">${row.label}</p><p class="v">${row.value}</p>`), row.label);
    for (const angle of quoteGalleries(quote)[0]?.angles ?? []) assert.ok(html.includes(`<figcaption>${angle.label}</figcaption>`), angle.label);
    assert.ok(html.includes(quoteTermsLines(quote, seller).join("\n")));
  });
});
