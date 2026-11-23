import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { approxFonts, createBadgeDocument, type BadgeDocument } from "@/engine";
import { endPriceTable } from "@/engine/price-model";
import { DEFAULT_PRICE_MODEL } from "@/engine/default-price-model";
import { DEFAULT_COMPANY } from "@/lib/company/profile";
import type { DeliveryAddress } from "@/lib/orders/delivery";
import { MISSING_DELIVERY_ERROR, MISSING_PHONE_ERROR, acceptanceIssue, acceptedDelivery } from "./accept";
import { workshopSeller } from "@/lib/company/seller";
import { quoteHtml } from "./document";
import { addDays, canCustomerAnswer, canEditQuote, displayStatus, type StoredQuote } from "./model";

const badge: BadgeDocument = { ...createBadgeDocument(["Anna Lind", "Säljare"]), materialId: "plastic-2-layer", colorId: "white-black", quantity: 4 };

function quote(patch: Partial<StoredQuote> = {}): StoredQuote {
  return {
    id: "q1",
    badgeShot: null,
    project: null,
    resellerId: "namnskylt",
    quoteNo: "OF-1001",
    customer: { id: "c1", name: "Anna Lind", company: "Kafé <Ett>", email: "anna@example.se", phone: "070-123", orgNumber: "556000-0000", address: "Storgatan 1\n111 22 Stockholm", demo: false },
    status: "sent",
    badges: [badge],
    pricing: { unitOverrides: [40], discountPercent: 10, extras: [{ label: "Expressorder", amountSek: 300 }] },
    priceList: endPriceTable(DEFAULT_PRICE_MODEL),
    shippingSek: 75,
    totalSek: 144,
    totalInclVatSek: 180,
    message: "Hej Anna!",
    validUntil: "2026-11-26",
    token: "t",
    orderNo: null,
    declineReason: null,
    delivery: { to: "customer", address: null },
    demo: false,
    createdAt: "2026-10-27T10:00:00Z",
    sentAt: "2026-10-27T11:00:00Z",
    emailedAt: null,
    decidedAt: null,
    events: [],
    ...patch,
  };
}

describe("offertens status", () => {
  it("en skickad offert går ut efter sista giltiga dag", () => {
    assert.equal(displayStatus(quote(), new Date("2026-11-26T22:00:00Z")), "sent");
    assert.equal(displayStatus(quote(), new Date("2026-11-27T12:00:00Z")), "expired");
    assert.equal(canCustomerAnswer(quote(), new Date("2026-11-27T12:00:00Z")), false);
  });

  it("utkast och nekade går att ändra, godkända inte", () => {
    assert.equal(canEditQuote({ status: "draft" }), true);
    assert.equal(canEditQuote({ status: "declined" }), true);
    assert.equal(canEditQuote({ status: "accepted" }), false);
  });

  it("räknar dagar över månadsskifte", () => {
    assert.equal(addDays("2026-10-27", 30), "2026-11-26");
  });
});

describe("offertdokumentet", () => {
  const html = quoteHtml(quote(), approxFonts);

  it("visar kundens uppgifter, rabatt och totaler — och escapar text", () => {
    assert.match(html, /OF-1001/);
    assert.match(html, /Kafé &lt;Ett&gt;/);
    assert.match(html, /556000-0000/);
    assert.match(html, /Rabatt [\d,]+ %/);
    assert.match(html, /<b>Expressorder<\/b>/, "extra kostnad som egen rad");
    assert.match(html, /<s>/, "listpriset stryks när à-priset är ändrat");
    assert.doesNotMatch(html, /<Ett>/);
  });

  it("har projektets namn som rubrik och kunden ovanför", () => {
    const named = quoteHtml(quote({ project: "Receptionen <2027>" }), approxFonts);
    assert.match(named, /<h1>Receptionen &lt;2027&gt;<\/h1>/);
    assert.match(named, /Offert till Kafé &lt;Ett&gt;/);
    assert.match(html, /<h1>Namnskyltar till Kafé &lt;Ett&gt;<\/h1>/);
  });

  it("bäddar in skyltarna så att PDF:en inte hämtar något", () => {
    assert.match(html, /<svg/);
    assert.doesNotMatch(html, /src="http/);
  });

  it("bär Skylt & Gravyrtekniks uppgifter och sajtens logga när säljaren är namnskylt.com", () => {
    const seller = workshopSeller({ quoteTerms: "Betalning 30 dagar netto" });
    const html = quoteHtml(quote(), approxFonts, { ...seller, logo: "data:image/svg+xml;base64,PHN2Zy8+" });
    assert.match(html, /<img class="logo" src="data:image\/svg\+xml;base64,PHN2Zy8\+" alt="namnskylt\.com">/);
    assert.match(html, /Skylt &amp; Gravyrteknik i Sverige AB · Org\.nr 556464-2261/);
    assert.match(html, /order@skyltochgravyr\.com/);
    assert.match(html, /Betalning 30 dagar netto/);
    // Utan loggans fil står namnet i stället.
    assert.match(quoteHtml(quote(), approxFonts, seller), /<div class="brand">Skylt &amp; Gravyrteknik<\/div>/);
  });

  it("använder återförsäljarens logga, färger, uppgifter och villkor", () => {
    const branded = quoteHtml(quote(), approxFonts, {
      ...DEFAULT_COMPANY,
      name: "Profilhuset <AB>",
      orgNumber: "556123-4567",
      logo: "data:image/png;base64,iVBORw0KGgo=",
      primaryColor: "#7a1f2b",
      accentColor: "#c08a2e",
      quoteTerms: "Betalning 30 dagar netto",
    });
    assert.match(branded, /<img class="logo" src="data:image\/png;base64,iVBORw0KGgo="/);
    assert.match(branded, /color:#7a1f2b/);
    assert.match(branded, /color:#c08a2e/);
    assert.match(branded, /Profilhuset &lt;AB&gt; · Org\.nr 556123-4567/);
    assert.match(branded, /Betalning 30 dagar netto/);
    assert.doesNotMatch(branded, /#0b1f3a/);
  });
});

describe("leveransen när offerten godkänns", () => {
  const typed: DeliveryAddress = {
    name: "Kafé Ett",
    contactName: "Anna Lind",
    line1: "Storgatan 1",
    line2: null,
    zip: "111 22",
    city: "Stockholm",
    country: "SE",
    phone: null,
  };
  const stored: DeliveryAddress = { ...typed, line1: "Lagervägen 4", zip: "431 53", city: "Mölndal" };

  it("till kunden: adressen kunden fyller i gäller, före den som stod på offerten", () => {
    assert.deepEqual(acceptedDelivery(quote({ delivery: { to: "customer", address: stored } }), typed), { to: "customer", address: typed });
  });

  it("fraktsättet på offerten följer med till ordern", () => {
    assert.deepEqual(acceptedDelivery(quote({ delivery: { to: "customer", address: stored, method: "express" } }), typed), {
      to: "customer",
      address: typed,
      method: "express",
    });
  });

  it("leveransspecifikationen: utelämnad ger offertens, tom tar bort den, och upphämtning har ingen", () => {
    const withText = quote({ delivery: { to: "customer", address: stored, instructions: "Anna till Göteborg" } });
    assert.equal(acceptedDelivery(withText, typed)?.instructions, "Anna till Göteborg");
    assert.equal(acceptedDelivery(withText, typed, null, "Allt till Stockholm")?.instructions, "Allt till Stockholm");
    // Kunden tömde fältet: då ska ingen text följa med till verkstaden.
    assert.equal(acceptedDelivery(withText, typed, null, "")?.instructions, undefined);
    assert.equal(acceptedDelivery(withText, typed, null, null)?.instructions, undefined);
    assert.equal(acceptedDelivery(withText, typed, "pickup")?.instructions, undefined);
  });

  it("till kunden utan ny adress: offertens adress gäller, och utan någon adress stoppas godkännandet", () => {
    assert.deepEqual(acceptedDelivery(quote({ delivery: { to: "customer", address: stored } }), null), { to: "customer", address: stored });
    assert.equal(acceptedDelivery(quote(), null), null);
  });

  it("offertens PDF visar kundens leveransadress, men aldrig återförsäljarens", () => {
    const toCustomer = quoteHtml(quote({ delivery: { to: "customer", address: typed } }), approxFonts, DEFAULT_COMPANY);
    assert.match(toCustomer, /Leverans/);
    assert.match(toCustomer, /Storgatan 1/);
    const toReseller = quoteHtml(quote({ delivery: { to: "reseller", address: stored } }), approxFonts, { ...DEFAULT_COMPANY, name: "Exempelprofil AB" });
    assert.match(toReseller, /Till Exempelprofil AB/);
    assert.doesNotMatch(toReseller, /Lagervägen/);
    assert.doesNotMatch(quoteHtml(quote(), approxFonts, DEFAULT_COMPANY), /Leverans<\/p>/);
  });

  it("offertens PDF har offertens frakt som egen rad i summan", () => {
    const html = quoteHtml(quote({ pricing: null }), approxFonts, DEFAULT_COMPANY);
    assert.match(html, /<span>Frakt<\/span><span>75\skr<\/span>/);
    // Frakten följer offerten, inte kundens pris: en rabatt eller en extrarad ändrar den inte.
    assert.match(quoteHtml(quote(), approxFonts, DEFAULT_COMPANY), /<span>Frakt<\/span><span>75\skr<\/span>/);
    assert.doesNotMatch(quoteHtml(quote({ shippingSek: 0 }), approxFonts, DEFAULT_COMPANY), /<span>Frakt<\/span>/);
  });

  it("godkänner återförsäljaren åt kunden ska telefonen stå på offerten när skyltarna fraktas", () => {
    const withPhone = { to: "customer", address: { ...stored, phone: "070-123 45 67" } } as const;
    const withoutPhone = { to: "customer", address: { ...stored, phone: null } } as const;
    assert.equal(acceptanceIssue(null, true), MISSING_DELIVERY_ERROR);
    assert.equal(acceptanceIssue(null, false), MISSING_DELIVERY_ERROR);
    assert.equal(acceptanceIssue(withPhone, true), null);
    assert.equal(acceptanceIssue(withoutPhone, true), MISSING_PHONE_ERROR);
    // Den som hämtar själv behöver ingen telefon.
    assert.equal(acceptanceIssue({ ...withoutPhone, method: "pickup" }, true), null);
    // Kundens eget godkännande prövas i kundens formulär, och en äldre offert till återförsäljaren får sakna telefon.
    assert.equal(acceptanceIssue(withoutPhone, false), null);
    assert.equal(acceptanceIssue({ to: "reseller", address: { ...stored, phone: null } }, false), null);
  });

  it("till återförsäljaren: kunden kan inte byta adress", () => {
    assert.deepEqual(acceptedDelivery(quote({ delivery: { to: "reseller", address: stored } }), typed), { to: "reseller", address: stored });
    assert.equal(acceptedDelivery(quote({ delivery: { to: "reseller", address: null } }), typed), null);
  });
});
