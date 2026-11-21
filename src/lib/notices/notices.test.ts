import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { adminNoticeEmailSettings, composeNoticeEmail, noticeEmailSettings } from "./email";
import { badgeCountLabel, customerLabel, isNoticeKind, noticeView, NOTICE_KINDS, type PanelNotice } from "./model";

const base: PanelNotice = {
  id: "7b0e1c52-0000-4000-8000-000000000001",
  kind: "quote-accepted",
  who: "Exempel AB",
  detail: null,
  quoteNo: "OF-1007",
  orderNo: "NS-1091",
  createdAt: "2026-11-15T09:00:00.000Z",
};

describe("beskedets text", () => {
  test("godkänd offert pekar på ordern som lades", () => {
    const view = noticeView(base);
    assert.equal(view.title, "Exempel AB har godkänt offert OF-1007");
    assert.equal(view.detail, "Ordern NS-1091 är lagd.");
    assert.equal(view.href, "/admin/ordrar/NS-1091");
    assert.equal(view.tone, "good");
  });

  test("godkänd offert utan order pekar på offerten", () => {
    const view = noticeView({ ...base, orderNo: null });
    assert.equal(view.href, "/admin/offerter/OF-1007");
    assert.equal(view.detail, null);
  });

  test("ett nej visar kundens skäl inom citattecken och pekar på offerten", () => {
    const view = noticeView({ ...base, kind: "quote-declined", orderNo: null, detail: " För dyrt " });
    assert.equal(view.title, "Exempel AB har tackat nej till offert OF-1007");
    assert.equal(view.detail, "”För dyrt”");
    assert.equal(view.href, "/admin/offerter/OF-1007");
    assert.equal(view.tone, "warn");
  });

  test("ett nej utan skäl har ingen andra rad", () => {
    assert.equal(noticeView({ ...base, kind: "quote-declined", orderNo: null, detail: "  " }).detail, null);
  });

  test("korrekturets svar pekar på ordern", () => {
    const approved = noticeView({ ...base, kind: "proof-approved", quoteNo: null });
    assert.equal(approved.title, "Exempel AB har godkänt sitt korrektur");
    assert.equal(approved.href, "/admin/ordrar/NS-1091");
    const changes = noticeView({ ...base, kind: "proof-changes", quoteNo: null, detail: "Större text" });
    assert.equal(changes.title, "Exempel AB vill ändra i sitt korrektur");
    assert.equal(changes.detail, "”Större text”");
    assert.equal(changes.tone, "warn");
  });

  test("kundens egen order visar antalet utan citattecken", () => {
    const view = noticeView({ ...base, kind: "order-placed", quoteNo: null, detail: badgeCountLabel(4) });
    assert.equal(view.title, "Exempel AB har lagt en order");
    assert.equal(view.detail, "4 skyltar");
    assert.equal(view.href, "/admin/ordrar/NS-1091");
  });

  test("en ansökan pekar på adminens sida för återförsäljare", () => {
    const view = noticeView({ ...base, kind: "application", quoteNo: null, orderNo: null });
    assert.equal(view.title, "Exempel AB har ansökt om att bli återförsäljare");
    assert.equal(view.href, "/admin/aterforsaljare");
  });

  test("varje slag har en text och en sida i panelen", () => {
    for (const kind of NOTICE_KINDS) {
      const view = noticeView({ ...base, kind });
      // Beskeden om en ny order börjar med ordern och nämner sedan vem det gäller.
      assert.ok(view.title.includes("Exempel AB"), kind);
      assert.ok(view.href.startsWith("/admin"), kind);
    }
  });

  test("okända slag i databasen känns inte igen", () => {
    assert.equal(isNoticeKind("quote-accepted"), true);
    assert.equal(isNoticeKind("något annat"), false);
  });

  test("kunden nämns vid företaget, annars vid namnet", () => {
    assert.equal(customerLabel({ name: "Anna", company: "Exempel AB" }), "Exempel AB");
    assert.equal(customerLabel({ name: "Anna", company: "  " }), "Anna");
    assert.equal(customerLabel({ name: "Anna" }), "Anna");
    assert.equal(badgeCountLabel(1), "1 skylt");
  });
});

describe("mejl om besked", () => {
  const on = { NOTICE_RESEND_API_KEY: "re_notice", NOTICE_FROM_EMAIL: "namnskylt.com <besked@mail.namnskylt.com>" };

  test("är avstängt utan sin egen nyckel, även med avsändare", () => {
    assert.equal(noticeEmailSettings({ NOTICE_FROM_EMAIL: on.NOTICE_FROM_EMAIL }), null);
    assert.equal(noticeEmailSettings({ ...on, NOTICE_RESEND_API_KEY: "  " }), null);
  });

  test("utskickets nyckel slår inte på det", () => {
    // RESEND_API_KEY gäller bara utskicket till återförsäljare. Förut delade mejlen den nyckeln.
    assert.equal(noticeEmailSettings({ RESEND_API_KEY: "re_x", NOTICE_FROM_EMAIL: on.NOTICE_FROM_EMAIL }), null);
  });

  test("är avstängt utan avsändare, även med nyckel", () => {
    assert.equal(noticeEmailSettings({ NOTICE_RESEND_API_KEY: "re_notice" }), null);
    assert.equal(noticeEmailSettings({ NOTICE_RESEND_API_KEY: "re_notice", NOTICE_FROM_EMAIL: "  " }), null);
  });

  test("nödstoppet stänger av det", () => {
    assert.equal(noticeEmailSettings({ ...on, OUTREACH_DISABLED: "true" }), null);
  });

  test("en avsändare som inte är en adress stänger av det", () => {
    assert.equal(noticeEmailSettings({ ...on, NOTICE_FROM_EMAIL: "namnskylt.com" }), null);
  });

  test("med båda satta gäller nyckeln och avsändaren, och länkarna går till sajten", () => {
    assert.deepEqual(noticeEmailSettings(on), {
      apiKey: "re_notice",
      from: "namnskylt.com <besked@mail.namnskylt.com>",
      replyTo: "besked@mail.namnskylt.com",
      origin: "https://www.namnskylt.com",
      apiUrl: null,
    });
    assert.equal(noticeEmailSettings({ ...on, NOTICE_PUBLIC_URL: "https://exempel.se/" })?.origin, "https://exempel.se");
    assert.equal(noticeEmailSettings({ ...on, NOTICE_PUBLIC_URL: "exempel.se" }), null);
    assert.equal(noticeEmailSettings({ ...on, NOTICE_FROM_EMAIL: "besked@mail.namnskylt.com" })?.replyTo, "besked@mail.namnskylt.com");
  });

  test("en låtsasmottagare för prov får bara ligga på samma dator", () => {
    assert.equal(noticeEmailSettings({ ...on, NOTICE_RESEND_API_URL: "http://localhost:3998/emails" })?.apiUrl, "http://localhost:3998/emails");
    // En adress någon annanstans stänger av mejlet, hellre än att nyckeln skickas dit.
    assert.equal(noticeEmailSettings({ ...on, NOTICE_RESEND_API_URL: "https://exempel.se/emails" }), null);
  });

  test("mejlet bär beskedets mening, kundens ord och länken till panelen", () => {
    const settings = noticeEmailSettings(on);
    assert.ok(settings);
    const notice: PanelNotice = { ...base, kind: "quote-declined", orderNo: null, detail: "För dyrt <b>nu</b>" };
    const email = composeNoticeEmail(notice, "anna@exempel.se", settings);
    assert.equal(email.to, "anna@exempel.se");
    assert.equal(email.from, on.NOTICE_FROM_EMAIL);
    assert.equal(email.subject, "Exempel AB har tackat nej till offert OF-1007");
    assert.match(email.text, /Exempel AB har tackat nej till offert OF-1007\./);
    assert.match(email.text, /”För dyrt <b>nu<\/b>”/);
    assert.match(email.text, /https:\/\/www\.namnskylt\.com\/admin\/offerter\/OF-1007/);
    assert.match(email.html, /För dyrt &lt;b&gt;nu&lt;\/b&gt;/);
    assert.doesNotMatch(email.html, /<b>nu<\/b>/);
    assert.match(email.html, /href="https:\/\/www\.namnskylt\.com\/admin\/offerter\/OF-1007"/);
    assert.equal(email.idempotencyKey, `notice:${base.id}`);
  });

  test("ett kundnamn med radbrytning kan inte lägga till rader i ämnet", () => {
    const settings = noticeEmailSettings(on);
    assert.ok(settings);
    const email = composeNoticeEmail({ ...base, who: "Exempel AB\r\nBcc: x@y.se" }, "anna@exempel.se", settings);
    assert.doesNotMatch(email.subject, /[\r\n]/);
  });
});

describe("adminens besked som mejl", () => {
  const on = {
    ADMIN_NOTICE_RESEND_API_KEY: "re_admin",
    ADMIN_NOTICE_FROM_EMAIL: "namnskylt.com <besked@exempel.se>",
    ADMIN_NOTICE_TO: "Ett@Exempel.se, tva@exempel.se",
  };

  test("har sin egen strömbrytare: alla tre variablerna krävs", () => {
    assert.equal(adminNoticeEmailSettings({}), null);
    for (const missing of Object.keys(on)) assert.equal(adminNoticeEmailSettings({ ...on, [missing]: " " }), null, missing);
    assert.deepEqual(adminNoticeEmailSettings(on), {
      apiKey: "re_admin",
      from: "namnskylt.com <besked@exempel.se>",
      replyTo: "besked@exempel.se",
      origin: "https://www.namnskylt.com",
      recipients: ["ett@exempel.se", "tva@exempel.se"],
      apiUrl: null,
    });
  });

  test("slås inte på av sajtens övriga mejl, och slår inte på dem", () => {
    // Den vanliga nyckeln och avsändaren räcker inte för adminens besked.
    assert.equal(adminNoticeEmailSettings({ RESEND_API_KEY: "re_x", NOTICE_FROM_EMAIL: "namnskylt.com <besked@exempel.se>", ADMIN_NOTICE_TO: on.ADMIN_NOTICE_TO }), null);
    // Och adminens strömbrytare öppnar inte återförsäljarnas besked eller kundens mejl.
    assert.equal(noticeEmailSettings(on), null);
  });

  test("nödstoppet stänger av det", () => {
    assert.equal(adminNoticeEmailSettings({ ...on, OUTREACH_DISABLED: "true" }), null);
  });

  test("en mottagare som inte är en adress stänger av det, hellre än att bara en del får mejlet", () => {
    assert.equal(adminNoticeEmailSettings({ ...on, ADMIN_NOTICE_TO: "ett@exempel.se, inte-en-adress" }), null);
    assert.equal(adminNoticeEmailSettings({ ...on, ADMIN_NOTICE_TO: Array.from({ length: 6 }, (_, i) => `m${i}@exempel.se`).join(",") }), null);
    // Samma adress två gånger får ett mejl.
    assert.deepEqual(adminNoticeEmailSettings({ ...on, ADMIN_NOTICE_TO: "ett@exempel.se; ETT@exempel.se" })?.recipients, ["ett@exempel.se"]);
  });

  test("låtsasmottagaren för prov får bara ligga på samma dator", () => {
    assert.equal(adminNoticeEmailSettings({ ...on, ADMIN_NOTICE_RESEND_API_URL: "http://localhost:3998/emails" })?.apiUrl, "http://localhost:3998/emails");
    assert.equal(adminNoticeEmailSettings({ ...on, ADMIN_NOTICE_RESEND_API_URL: "https://exempel.se/emails" }), null);
  });
});

describe("besked om en offert som kunden har laddat ner själv", () => {
  const made: PanelNotice = {
    id: "9",
    kind: "quote-created",
    who: "Exempel AB",
    detail: "4 skyltar · 1 234 kr exkl. moms",
    quoteNo: "OF-2001",
    orderNo: null,
    createdAt: "2026-11-20T15:00:00Z",
  };

  test("säger vem som laddade ner vilken offert, och leder till offerten i panelen", () => {
    assert.ok(isNoticeKind("quote-created"));
    assert.deepEqual(noticeView(made), {
      title: "Exempel AB har laddat ner offert OF-2001",
      detail: "4 skyltar · 1 234 kr exkl. moms",
      href: "/admin/offerter/OF-2001",
      tone: "info",
    });
  });

  test("mejlet till adminens adresser säger samma sak som panelen", () => {
    const settings = adminNoticeEmailSettings({ ADMIN_NOTICE_RESEND_API_KEY: "re_admin", ADMIN_NOTICE_FROM_EMAIL: "besked@exempel.se", ADMIN_NOTICE_TO: "ett@exempel.se" });
    assert.ok(settings);
    const mail = composeNoticeEmail(made, "ett@exempel.se", settings);
    assert.equal(mail.subject, "Exempel AB har laddat ner offert OF-2001");
    assert.match(mail.text, /4 skyltar · 1 234 kr exkl\. moms/);
    assert.match(mail.text, /https:\/\/www\.namnskylt\.com\/admin\/offerter\/OF-2001/);
  });
});

describe("besked till namnskylt.com om varje ny order", () => {
  const base: PanelNotice = { id: "1", kind: "reseller-order", who: "Exempel Profil AB", detail: "3 skyltar", quoteNo: null, orderNo: "NS-2001", createdAt: "2026-11-20T10:00:00Z" };

  test("en order hos en återförsäljare nämner återförsäljaren och leder till Tillverkning, där alla ordrar står", () => {
    assert.deepEqual(noticeView(base), { title: "Ny order NS-2001 hos Exempel Profil AB", detail: "3 skyltar", href: "/admin/tillverkning", tone: "info" });
  });

  test("en order i namnskylt.coms egen panel nämner kunden och leder till ordern", () => {
    assert.deepEqual(noticeView({ ...base, kind: "order-created", who: "Kund AB" }), {
      title: "Ny order NS-2001 till Kund AB",
      detail: "3 skyltar",
      href: "/admin/ordrar/NS-2001",
      tone: "info",
    });
  });

  test("de nya beskeden är giltiga, och mejlet säger samma sak som panelen", () => {
    assert.ok(isNoticeKind("reseller-order") && isNoticeKind("order-created"));
    const settings = adminNoticeEmailSettings({ ADMIN_NOTICE_RESEND_API_KEY: "re_admin", ADMIN_NOTICE_FROM_EMAIL: "besked@exempel.se", ADMIN_NOTICE_TO: "ett@exempel.se" });
    assert.ok(settings);
    const mail = composeNoticeEmail(base, "ett@exempel.se", settings);
    assert.equal(mail.subject, "Ny order NS-2001 hos Exempel Profil AB");
    assert.match(mail.text, /https:\/\/www\.namnskylt\.com\/admin\/tillverkning/);
  });
});
