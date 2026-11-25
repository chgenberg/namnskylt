import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { CALLBACK_INBOX, DEMO_CONTACT } from "./contact";
import { composeCallbackEmail } from "./email";
import { callbackRequestSchema, phoneDigits } from "./model";

describe("förfrågan om att bli uppringd", () => {
  test("namn och nummer räcker", () => {
    const parsed = callbackRequestSchema.safeParse({ name: " Anna Lind ", phone: "070-123 45 67" });
    assert.ok(parsed.success);
    assert.equal(parsed.data.name, "Anna Lind");
  });

  test("numret ska vara ett nummer", () => {
    for (const phone of ["", "123", "ring mig", "070-12x 45 67", "1".repeat(20)]) {
      assert.equal(callbackRequestSchema.safeParse({ name: "Anna", phone }).success, false, phone);
    }
    for (const phone of ["+46 70 123 45 67", "(031) 12 34 56", "0701234567"]) {
      assert.ok(callbackRequestSchema.safeParse({ name: "Anna", phone }).success, phone);
    }
  });

  test("namnet får inte bära html eller radbrytningar", () => {
    for (const name of ["", " ", "<b>Anna</b>", "Anna\nBcc: x@y.se", "a".repeat(81)]) {
      assert.equal(callbackRequestSchema.safeParse({ name, phone: "0701234567" }).success, false, JSON.stringify(name));
    }
  });

  test("+46 blir 0", () => {
    assert.equal(phoneDigits("+46 70-123 45 67"), "0701234567");
    assert.equal(phoneDigits("031-12 34 56"), "031123456");
  });
});

describe("mejlet till inkorgen", () => {
  const at = new Date("2026-11-25T13:00:00Z");
  const settings = { from: "namnskylt.com <besked@skyltochgravyr.com>", origin: "https://www.namnskylt.com" };

  test("går till hej@namnskylt.com med namn och nummer i ämnet", () => {
    const mail = composeCallbackEmail({ name: "Anna Lind", phone: "070-123 45 67", company: null, leadEmail: null, at }, settings);
    assert.equal(mail.to, CALLBACK_INBOX);
    assert.equal(mail.to, "hej@namnskylt.com");
    assert.equal(mail.subject, "Ring upp: Anna Lind, 070-123 45 67");
    assert.match(mail.html, /href="tel:\+46701234567"/);
    assert.match(mail.text, /Telefon: 070-123 45 67/);
    assert.doesNotMatch(mail.html, /Företag/);
  });

  test("från utskicket står företaget och adressen med", () => {
    const mail = composeCallbackEmail(
      { name: "Anna Lind", phone: "0701234567", company: "Exempel & <Co> AB", leadEmail: "anna@exempel.se", at },
      settings,
    );
    assert.match(mail.html, /Exempel &amp; &lt;Co&gt; AB/);
    assert.doesNotMatch(mail.html, /<Co>/);
    assert.match(mail.text, /Mejlet gick till: anna@exempel\.se/);
  });

  test("samma förfrågan inom samma minut har samma nyckel hos Resend", () => {
    const a = composeCallbackEmail({ name: "Anna", phone: "070-123 45 67", company: null, leadEmail: null, at }, settings);
    const b = composeCallbackEmail({ name: "anna", phone: "+46701234567", company: null, leadEmail: null, at: new Date(at.getTime() + 20_000) }, settings);
    const c = composeCallbackEmail({ name: "Anna", phone: "070-123 45 67", company: null, leadEmail: null, at: new Date(at.getTime() + 120_000) }, settings);
    assert.equal(a.idempotencyKey, b.idempotencyKey);
    assert.notEqual(a.idempotencyKey, c.idempotencyKey);
  });

  test("Pärs nummer går att ringa", () => {
    assert.equal(DEMO_CONTACT.tel, "+46761884800");
    assert.equal(DEMO_CONTACT.phone.replace(/\D/g, "").replace(/^0/, "46"), DEMO_CONTACT.tel.slice(1));
  });
});
