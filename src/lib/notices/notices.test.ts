import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { composeNoticeEmail, noticeEmailSettings } from "./email";
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
      assert.ok(view.title.startsWith("Exempel AB "), kind);
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
  const on = { RESEND_API_KEY: "re_x", NOTICE_FROM_EMAIL: "namnskylt.com <besked@mail.namnskylt.com>" };

  test("är avstängt utan Resend-nyckel, även med avsändare", () => {
    assert.equal(noticeEmailSettings({ NOTICE_FROM_EMAIL: on.NOTICE_FROM_EMAIL }), null);
  });

  test("är avstängt utan avsändare, även med Resend-nyckel", () => {
    assert.equal(noticeEmailSettings({ RESEND_API_KEY: "re_x" }), null);
    assert.equal(noticeEmailSettings({ RESEND_API_KEY: "re_x", NOTICE_FROM_EMAIL: "  " }), null);
  });

  test("nödstoppet stänger av det", () => {
    assert.equal(noticeEmailSettings({ ...on, OUTREACH_DISABLED: "true" }), null);
  });

  test("en avsändare som inte är en adress stänger av det", () => {
    assert.equal(noticeEmailSettings({ ...on, NOTICE_FROM_EMAIL: "namnskylt.com" }), null);
  });

  test("med båda satta gäller avsändaren, och länkarna går till sajten", () => {
    assert.deepEqual(noticeEmailSettings(on), {
      from: "namnskylt.com <besked@mail.namnskylt.com>",
      replyTo: "besked@mail.namnskylt.com",
      origin: "https://www.namnskylt.com",
    });
    assert.equal(noticeEmailSettings({ ...on, NOTICE_PUBLIC_URL: "https://exempel.se/" })?.origin, "https://exempel.se");
    assert.equal(noticeEmailSettings({ ...on, NOTICE_PUBLIC_URL: "exempel.se" }), null);
    assert.equal(noticeEmailSettings({ ...on, NOTICE_FROM_EMAIL: "besked@mail.namnskylt.com" })?.replyTo, "besked@mail.namnskylt.com");
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
