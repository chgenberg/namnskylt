import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { approxFonts, createBadgeDocument, type BadgeDocument } from "@/engine";
import { DEFAULT_COMPANY } from "@/lib/company/profile";
import { quoteHtml } from "./document";
import { addDays, canCustomerAnswer, canEditQuote, displayStatus, type StoredQuote } from "./model";

const badge: BadgeDocument = { ...createBadgeDocument(["Anna Lind", "Säljare"]), materialId: "plastic-2-layer", colorId: "white-black", quantity: 4 };

function quote(patch: Partial<StoredQuote> = {}): StoredQuote {
  return {
    id: "q1",
    badgeShot: null,
    project: null,
    quoteNo: "OF-1001",
    customer: { id: "c1", name: "Anna Lind", company: "Kafé <Ett>", email: "anna@example.se", phone: "070-123", orgNumber: "556000-0000", address: "Storgatan 1\n111 22 Stockholm", demo: false },
    status: "sent",
    badges: [badge],
    pricing: { unitOverrides: [40], discountPercent: 10 },
    totalSek: 144,
    totalInclVatSek: 180,
    message: "Hej Anna!",
    validUntil: "2026-11-26",
    token: "t",
    orderNo: null,
    declineReason: null,
    demo: false,
    createdAt: "2026-10-27T10:00:00Z",
    sentAt: "2026-10-27T11:00:00Z",
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
    assert.match(html, /Rabatt 10 %/);
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
