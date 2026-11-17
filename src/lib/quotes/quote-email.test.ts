import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { composeQuoteEmail, quoteAnswerOf, quoteEmailSettings, type QuoteMail, type QuoteMailSender } from "./quote-email";

const QUOTE: QuoteMail = {
  quoteNo: "OF-1042",
  project: "Namnskyltar till receptionen",
  customerName: "Anna Lind",
  customerEmail: "anna@exempel.se",
  quantity: 12,
  totalSek: 1789,
  totalInclVatSek: 2236,
  shippingPending: false,
  validUntil: "2026-12-17",
  message: "Hör av dig om något ska ändras.",
  url: "https://www.namnskylt.com/offert/abc123",
  sentAt: "2026-11-17T20:00:00.000Z",
};

const SENDER: QuoteMailSender = {
  sellerName: "Exempel Profil AB",
  replyTo: "kontakt@exempelprofil.se",
  fromAddress: "offert@verkstaden.se",
  footer: ["Exempel Profil AB · Org.nr 556123-4567", "Storgatan 1, 111 22 Stockholm"],
};

describe("offertmejlets strömbrytare", () => {
  test("mejlet är av utan nyckel eller avsändare", () => {
    assert.equal(quoteEmailSettings({}), null);
    assert.equal(quoteEmailSettings({ QUOTE_RESEND_API_KEY: "nyckel" }), null);
    assert.equal(quoteEmailSettings({ QUOTE_FROM_EMAIL: "offert@verkstaden.se" }), null);
    assert.equal(quoteEmailSettings({ QUOTE_RESEND_API_KEY: " ", QUOTE_FROM_EMAIL: "offert@verkstaden.se" }), null);
    assert.equal(quoteEmailSettings({ QUOTE_RESEND_API_KEY: "nyckel", QUOTE_FROM_EMAIL: "inte en adress" }), null);
  });

  test("den allmänna mejlnyckeln slår aldrig på offertmejlet", () => {
    assert.equal(quoteEmailSettings({ RESEND_API_KEY: "nyckel", NOTICE_FROM_EMAIL: "info@namnskylt.com" }), null);
  });

  test("med båda är mejlet på, och går till Resend", () => {
    assert.deepEqual(quoteEmailSettings({ QUOTE_RESEND_API_KEY: " nyckel ", QUOTE_FROM_EMAIL: " offert@verkstaden.se " }), {
      apiKey: "nyckel",
      fromAddress: "offert@verkstaden.se",
      apiUrl: null,
    });
  });

  test("nyckeln skickas bara till en annan mottagare när den ligger på samma dator", () => {
    const base = { QUOTE_RESEND_API_KEY: "nyckel", QUOTE_FROM_EMAIL: "offert@verkstaden.se" };
    assert.equal(quoteEmailSettings({ ...base, QUOTE_RESEND_API_URL: "http://localhost:3998/emails" })?.apiUrl, "http://localhost:3998/emails");
    assert.equal(quoteEmailSettings({ ...base, QUOTE_RESEND_API_URL: "http://127.0.0.1:3998/emails" })?.apiUrl, "http://127.0.0.1:3998/emails");
    assert.equal(quoteEmailSettings({ ...base, QUOTE_RESEND_API_URL: " " })?.apiUrl, null);
  });

  test("en adress som inte duger stänger av mejlet, i stället för att gå till riktiga Resend", () => {
    const base = { QUOTE_RESEND_API_KEY: "nyckel", QUOTE_FROM_EMAIL: "offert@verkstaden.se" };
    for (const url of ["https://ond.exempel.se/emails", "http://localhost.ond.se:80/emails", "http://localhost:3998", "https://localhost:3998/emails", "http://nyckel@ond.se:80/emails"]) {
      assert.equal(quoteEmailSettings({ ...base, QUOTE_RESEND_API_URL: url }), null, url);
    }
  });
});

describe("valet i offertmejlet", () => {
  test("bara de två knapparnas värden räknas", () => {
    assert.equal(quoteAnswerOf("godkann"), "accept");
    assert.equal(quoteAnswerOf("neka"), "decline");
    assert.equal(quoteAnswerOf(["neka", "godkann"]), "decline");
    assert.equal(quoteAnswerOf("ja"), null);
    assert.equal(quoteAnswerOf(undefined), null);
  });
});

describe("offertmejlet", () => {
  test("avsändarens namn är säljaren, adressen verkstadens, och svar går till säljaren", () => {
    const mail = composeQuoteEmail(QUOTE, SENDER);
    assert.equal(mail.from, '"Exempel Profil AB" <offert@verkstaden.se>');
    assert.equal(mail.replyTo, "kontakt@exempelprofil.se");
    assert.equal(mail.to, "anna@exempel.se");
    assert.equal(mail.subject, "Offert OF-1042 från Exempel Profil AB");
  });

  test("mejlet har knapparna Godkänn och Neka, som öppnar offerten med valet förvalt", () => {
    const mail = composeQuoteEmail(QUOTE, SENDER);
    for (const body of [mail.html, mail.text]) {
      assert.ok(body.includes("https://www.namnskylt.com/offert/abc123?svar=godkann"));
      assert.ok(body.includes("https://www.namnskylt.com/offert/abc123?svar=neka"));
      assert.ok(body.includes("Godkänn offerten"));
      assert.ok(body.includes("Neka offerten"));
    }
    assert.match(mail.text, /bekräftar ditt val med ett klick/);
  });

  test("mejlet säger vad offerten gäller och kostar, och säljarens uppgifter står under", () => {
    const { text } = composeQuoteEmail(QUOTE, SENDER);
    assert.match(text, /^Hej Anna,/);
    assert.match(text, /12 namnskyltar från Exempel Profil AB/);
    assert.match(text, /Offert: OF-1042, Namnskyltar till receptionen/);
    assert.match(text, /Summa exkl\. moms: 1[\s ]789 kr/);
    assert.match(text, /Summa inkl\. moms: 2[\s ]236 kr/);
    assert.match(text, /Giltig till och med: 17 dec\. 2026/);
    assert.match(text, /Hör av dig om något ska ändras\./);
    assert.match(text, /Exempel Profil AB · Org\.nr 556123-4567/);
  });

  test("expressfraktens pris är inte med i summan, och det sägs", () => {
    const { text } = composeQuoteEmail({ ...QUOTE, shippingPending: true, quantity: 1, project: null }, SENDER);
    assert.match(text, /Summa exkl\. moms: 1[\s ]789 kr \+ frakt/);
    assert.match(text, /en namnskylt från/);
    assert.match(text, /Offert: OF-1042\n/);
  });

  test("säljarens och kundens ord kan aldrig bli html eller nya rader i mejlets huvud", () => {
    const mail = composeQuoteEmail(
      { ...QUOTE, customerName: "<b>Anna</b>\nBcc: ond@exempel.se", message: '<script>alert("x")</script>' },
      { ...SENDER, sellerName: 'Exempel "Profil"\nBcc: ond@exempel.se <x@y.se>' },
    );
    assert.equal(mail.html.includes("<script>"), false);
    assert.equal(mail.html.includes("<b>Anna</b>"), false);
    assert.equal(/[\r\n]/.test(mail.from), false);
    assert.equal(/[\r\n]/.test(mail.subject), false);
    assert.ok(mail.from.endsWith("<offert@verkstaden.se>"));
  });

  test("samma utskick ger aldrig två mejl, men ett nytt utskick av samma offert är ett nytt mejl", () => {
    const first = composeQuoteEmail(QUOTE, SENDER);
    assert.equal(first.idempotencyKey, composeQuoteEmail(QUOTE, SENDER).idempotencyKey);
    assert.notEqual(first.idempotencyKey, composeQuoteEmail({ ...QUOTE, sentAt: "2026-11-18T08:00:00.000Z" }, SENDER).idempotencyKey);
  });
});
