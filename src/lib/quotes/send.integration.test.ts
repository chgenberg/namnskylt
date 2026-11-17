import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, test } from "node:test";
import { createBadgeDocument, toOfferedDocument } from "@/engine";
import { DEFAULT_COMPANY } from "@/lib/company/profile";
import { requireDb } from "@/lib/db/client";
import type { FetchLike } from "@/lib/email/resend-sender";
import { saveCompanyProfile, upsertCustomer } from "@/lib/orders/repository";
import { createQuote, getQuote } from "./repository";
import { quoteEmailOn, sendQuote } from "./send";

/** Körs bara mot en riktig databas med migreringen `031_quote_emailed`. Inget mejl lämnar datorn: Resend är utbytt mot en låtsasmottagare. */
const url = process.env.DATABASE_URL;

interface Sent {
  url: string;
  authorization: string | null;
  idempotencyKey: string | null;
  body: { from: string; to: string[]; reply_to: string; subject: string; text: string };
}

describe("offerten skickas och mejlas", { skip: !url }, () => {
  const tenant = `mejltest-${randomUUID().slice(0, 8)}`;
  const badge = { ...toOfferedDocument(createBadgeDocument(["Test Testsson", "Säljare"])), quantity: 4 };
  const sent: Sent[] = [];
  let status = 200;
  const resend: FetchLike = async (target, init) => {
    const headers = new Headers(init.headers);
    sent.push({
      url: target,
      authorization: headers.get("authorization"),
      idempotencyKey: headers.get("idempotency-key"),
      body: JSON.parse(String(init.body)) as Sent["body"],
    });
    return status === 200 ? Response.json({ id: `prov-${sent.length}` }) : Response.json({ message: "Resend svarar inte" }, { status });
  };
  const mailOn = () => {
    process.env.QUOTE_RESEND_API_KEY = "provnyckel";
    process.env.QUOTE_FROM_EMAIL = "offert@verkstaden.exempel.se";
  };
  const mailOff = () => {
    delete process.env.QUOTE_RESEND_API_KEY;
    delete process.env.QUOTE_FROM_EMAIL;
  };

  async function newQuote(demo = false): Promise<string> {
    const customer = await upsertCustomer(tenant, { name: "Anna Lind", email: `anna-${randomUUID().slice(0, 6)}@kund.exempel.se`, company: "Kund AB" });
    const { quoteNo } = await createQuote({ tenant, customerId: customer.id, badges: [badge], demo, project: "Skyltar till receptionen" });
    return quoteNo;
  }

  after(async () => {
    mailOff();
    const sql = requireDb();
    await sql`delete from quotes where reseller_id = ${tenant}`;
    await sql`delete from customers where reseller_id = ${tenant}`;
    await sql`delete from settings where key like ${`%:${tenant}`}`;
    await sql.end();
  });

  test("utan offertmejlets nyckel skickas offerten, men inget mejl går iväg", async () => {
    mailOff();
    assert.equal(quoteEmailOn(), false);
    const quoteNo = await newQuote();
    const result = await sendQuote(tenant, quoteNo, resend);
    assert.ok(result);
    assert.deepEqual({ status: result.quote.status, emailOn: result.emailOn, emailed: result.emailed, error: result.emailError }, { status: "sent", emailOn: false, emailed: false, error: null });
    assert.equal(sent.length, 0);
    assert.equal((await getQuote(tenant, quoteNo))?.emailedAt, null);
  });

  test("med nyckeln mejlas offerten i säljarens namn, och svar går till säljaren", async () => {
    mailOn();
    assert.equal(quoteEmailOn(), true);
    await saveCompanyProfile(tenant, { ...DEFAULT_COMPANY, name: "Mejltest Profil AB", email: "kontakt@mejltest.exempel.se" });
    const quoteNo = await newQuote();
    const result = await sendQuote(tenant, quoteNo, resend);
    assert.ok(result);
    assert.deepEqual({ emailOn: result.emailOn, emailed: result.emailed, error: result.emailError }, { emailOn: true, emailed: true, error: null });
    assert.equal(sent.length, 1);
    const mail = sent[0];
    assert.ok(mail);
    assert.equal(mail.url, "https://api.resend.com/emails");
    assert.equal(mail.authorization, "Bearer provnyckel");
    assert.equal(mail.body.from, '"Mejltest Profil AB" <offert@verkstaden.exempel.se>');
    assert.equal(mail.body.reply_to, "kontakt@mejltest.exempel.se");
    assert.deepEqual(mail.body.to, [result.quote.customer.email]);
    assert.equal(mail.body.subject, `Offert ${quoteNo} från Mejltest Profil AB`);
    assert.ok(mail.body.text.includes(`/offert/${result.quote.token}?svar=godkann`));
    assert.ok(mail.body.text.includes(`/offert/${result.quote.token}?svar=neka`));
    const stored = await getQuote(tenant, quoteNo);
    assert.ok(stored?.emailedAt);
    assert.equal(stored.status, "sent");
    assert.ok(stored.events.some((event) => event.note === "Offerten mejlad till kunden"));
  });

  test("skickas offerten igen går ett nytt mejl", async () => {
    mailOn();
    const quoteNo = await newQuote();
    await sendQuote(tenant, quoteNo, resend);
    await new Promise((resolve) => setTimeout(resolve, 15));
    await sendQuote(tenant, quoteNo, resend);
    const [first, second] = sent.slice(-2);
    assert.ok(first?.idempotencyKey && second?.idempotencyKey);
    assert.notEqual(first.idempotencyKey, second.idempotencyKey);
  });

  test("går mejlet inte iväg är offerten ändå skickad, och säljaren får veta", async () => {
    mailOn();
    status = 500;
    const before = sent.length;
    const quoteNo = await newQuote();
    const result = await sendQuote(tenant, quoteNo, resend);
    status = 200;
    assert.ok(result);
    assert.equal(sent.length, before + 1);
    assert.deepEqual({ status: result.quote.status, emailed: result.emailed }, { status: "sent", emailed: false });
    assert.match(result.emailError ?? "", /Mejlet gick inte iväg/);
    assert.equal((await getQuote(tenant, quoteNo))?.emailedAt, null);
  });

  test("en offert som har gått ut mejlas inte: knapparna skulle leda till en offert som inte går att svara på", async () => {
    mailOn();
    const before = sent.length;
    const quoteNo = await newQuote();
    await requireDb()`update quotes set valid_until = current_date - 1 where quote_no = ${quoteNo}`;
    const result = await sendQuote(tenant, quoteNo, resend);
    assert.ok(result);
    assert.equal(result.emailed, false);
    assert.match(result.emailError ?? "", /har gått ut/);
    assert.equal(sent.length, before);
  });

  test("en demooffert mejlas aldrig", async () => {
    mailOn();
    const before = sent.length;
    const result = await sendQuote(tenant, await newQuote(true), resend);
    assert.ok(result);
    assert.equal(result.emailed, false);
    assert.equal(sent.length, before);
  });

  test("en offert som inte finns, eller som en annan säljare äger, går inte att skicka", async () => {
    mailOn();
    const before = sent.length;
    const quoteNo = await newQuote();
    assert.equal(await sendQuote("en-annan-saljare", quoteNo, resend), null);
    assert.equal(await sendQuote(tenant, "OF-999999999", resend), null);
    assert.equal(sent.length, before);
  });
});
