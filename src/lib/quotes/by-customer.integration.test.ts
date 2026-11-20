import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, test } from "node:test";
import { plasticBadge } from "@/engine/testing";
import { requireDb } from "@/lib/db/client";
import { formatSek } from "@/lib/format";
import { getOrder, upsertCustomer } from "@/lib/orders/repository";
import { UNASSIGNED_CUSTOMER_EMAIL } from "@/lib/orders/unassigned-customer";
import { acceptQuote } from "./accept";
import { ANONYMOUS_REQUESTER, acceptCustomerQuote, saveCustomerQuote } from "./customer-quote";
import { NO_CUSTOMER_ERROR, hasQuoteParty, quoteCustomerLabel } from "./model";
import { createQuote, getQuote, getQuoteByToken, pruneUnclaimedCustomerQuotes } from "./repository";
import { quoteHeading, quoteInfoRows } from "./view";

/** Körs bara mot en riktig databas, utan kopplingen till verkstaden och utan mejlnycklar: inget lämnar datorn. */
const url = process.env.DATABASE_URL;

describe("offert som kunden har laddat ner själv", { skip: !url }, () => {
  const tenant = `kundoffert-${randomUUID().slice(0, 8)}`;
  const badge = { ...plasticBadge(["Test Testsson", "Säljare"]), quantity: 4 };
  const address = { name: "Holm & Söner AB", contactName: "Sam Holm", line1: "Provgatan 1", line2: "", zip: "123 45", city: "Provstad", country: "SE" as const, phone: "070-111 22 33" };
  const notices = async (quoteNo: string) => {
    const rows = await requireDb()<{ reseller_id: string; kind: string; who: string; detail: string | null }[]>`
      select n.reseller_id, n.kind, n.who, n.detail from notices n join quotes q on q.id = n.quote_id where q.quote_no = ${quoteNo} order by n.created_at`;
    return rows.map((row) => ({ ...row }));
  };

  after(async () => {
    const sql = requireDb();
    // Offerterna först: en godkänd offert pekar på sin order.
    await sql`delete from quotes where reseller_id = ${tenant}`;
    await sql`delete from orders where reseller_id = ${tenant}`;
    await sql`delete from customers where reseller_id = ${tenant}`;
    await sql.end();
  });

  test("går att ladda ner utan att fylla i något, och väntar på svar direkt", async () => {
    const { quoteNo, token } = await saveCustomerQuote({ tenant, badges: [badge] });
    const quote = await getQuote(tenant, quoteNo);
    assert.ok(quote);
    assert.equal(quote.byCustomer, true);
    // Ingen kund i registret än: kunden läggs upp när offerten godkänns.
    assert.equal(quote.noCustomer, true);
    assert.equal(hasQuoteParty(quote), false);
    assert.equal(quote.status, "sent");
    assert.equal(quote.emailedAt, null);
    assert.deepEqual(quote.delivery, { to: "customer", address: null });
    assert.match(quote.events.at(-1)?.note ?? "", /Kunden gjorde offerten själv/);

    const shown = await getQuoteByToken(token);
    assert.ok(shown);
    // Dokumentet har inga kundrader, och platshållarens adress följer aldrig med.
    assert.equal(quoteHeading(shown).title, "Namnskyltar");
    assert.ok(!quoteInfoRows(shown, { name: "Säljaren" }).some((row) => row.label === "Kund" || row.label === "Kontakt"));
    assert.ok(!JSON.stringify(shown).includes(UNASSIGNED_CUSTOMER_EMAIL));
    assert.equal(quoteCustomerLabel(quote), "Utan kund");

    // Den som äger panelen får ett besked, utan namn att nämna.
    assert.deepEqual(await notices(quoteNo), [
      { reseller_id: tenant, kind: "quote-created", who: ANONYMOUS_REQUESTER, detail: `4 skyltar · ${formatSek(quote.totalSek)} exkl. moms` },
    ]);
  });

  test("det kunden skriver om sig själv står på offerten, utan att kunden läggs upp i registret", async () => {
    const { quoteNo, token } = await saveCustomerQuote({
      tenant,
      requester: { company: "  Holm & Söner AB ", orgNumber: "5561112222", name: "Sam Holm", email: "Sam@Exempel.invalid" },
      badges: [badge],
    });
    const shown = await getQuoteByToken(token);
    assert.ok(shown);
    assert.equal(shown.noCustomer, true);
    assert.equal(hasQuoteParty(shown), true);
    assert.equal(quoteHeading(shown).title, "Namnskyltar till Holm & Söner AB");
    const rows = Object.fromEntries(quoteInfoRows(shown, { name: "Säljaren" }).map((row) => [row.label, row.value]));
    assert.equal(rows.Kund, "Holm & Söner AB");
    // Ett nummer som går att läsa skrivs som i kassan.
    assert.equal(rows["Org.nr"], "556111-2222");
    assert.equal(rows.Kontakt, "Sam Holm · sam@exempel.invalid");
    assert.equal((await notices(quoteNo))[0]?.who, "Holm & Söner AB");
    // Ingen kund med den adressen finns hos säljaren.
    const [found] = await requireDb()<{ n: number }[]>`select count(*)::int as n from customers where reseller_id = ${tenant} and email = 'sam@exempel.invalid'`;
    assert.equal(found?.n, 0);
    // Utan kund går offerten inte att godkänna åt kunden i panelen.
    assert.deepEqual(await acceptQuote(tenant, quoteNo, true), { ok: false, error: NO_CUSTOMER_ERROR });
  });

  test("kunden lägger upp sig när offerten godkänns, och då blir den en order", async () => {
    const { quoteNo, token } = await saveCustomerQuote({ tenant, requester: { company: "Holm & Söner AB" }, badges: [badge] });
    const quote = await getQuoteByToken(token);
    assert.ok(quote);

    // Utan uppgifter, eller med ofullständiga, blir det ingen order.
    assert.equal((await acceptCustomerQuote(quote, null, address, null, null)).ok, false);
    const short = await acceptCustomerQuote(quote, { company: "Holm & Söner AB", orgNumber: "123", name: "Sam Holm", email: "sam@exempel.invalid" }, address, null, null);
    assert.deepEqual(short, { ok: false, error: "Organisationsnumret ska ha tio siffror" });
    assert.equal((await getQuote(tenant, quoteNo))?.noCustomer, true);

    const result = await acceptCustomerQuote(quote, { company: "Holm & Söner AB", orgNumber: "556111-2222", name: "Sam Holm", email: "sam@exempel.invalid" }, address, null, "PO-77");
    assert.equal(result.ok, true);
    const accepted = await getQuote(tenant, quoteNo);
    assert.equal(accepted?.status, "accepted");
    assert.equal(accepted?.noCustomer, undefined);
    assert.equal(accepted?.customer.email, "sam@exempel.invalid");
    assert.equal(accepted?.customer.orgNumber, "556111-2222");
    const order = result.ok ? await getOrder(tenant, result.orderNo) : null;
    assert.equal(order?.customer.company, "Holm & Söner AB");
    assert.equal(order?.customerPo, "PO-77");
    assert.equal(order?.badges.length, 1);
  });

  test("visar aldrig kundregistrets telefon och adress för den som har länken", async () => {
    // Kunden fanns redan hos säljaren, med telefon och adress från en tidigare order.
    await upsertCustomer(tenant, {
      name: "Robin Berg",
      email: "robin@exempel.invalid",
      company: "Berg & Co AB",
      orgNumber: "556765-4321",
      phone: "070-123 45 67",
      address: "Hemliga gatan 1\n123 45 Staden",
    });
    // Någon som bara känner e-postadressen laddar ner en offert och skriver den på offerten.
    const { quoteNo, token } = await saveCustomerQuote({ tenant, requester: { company: "Berg & Co AB", email: "robin@exempel.invalid" }, badges: [badge] });
    const before = await getQuoteByToken(token);
    assert.ok(before);
    assert.ok(!JSON.stringify(before).includes("070-123") && !JSON.stringify(before).includes("Hemliga gatan"));

    // Också när offerten har fått kunden i registret, genom att någon godkänner med samma adress.
    const claimed = await acceptCustomerQuote(before, { company: "Berg & Co AB", orgNumber: "556765-4321", name: "Någon Annan", email: "robin@exempel.invalid" }, address, null, null);
    assert.equal(claimed.ok, true);
    const shown = await getQuoteByToken(token);
    assert.ok(shown);
    assert.equal(shown.customer.phone, null);
    assert.equal(shown.customer.address, null);
    const text = JSON.stringify(shown) + JSON.stringify(quoteInfoRows(shown, { name: "Säljaren" }));
    assert.ok(!text.includes("070-123"), "telefonen följer inte med");
    assert.ok(!text.includes("Hemliga gatan"), "adressen följer inte med");

    // Säljaren, som äger kundregistret, ser kunden som vanligt i panelen.
    const own = await getQuote(tenant, quoteNo);
    assert.equal(own?.customer.phone, "070-123 45 67");
    assert.match(own?.customer.address ?? "", /Hemliga gatan/);
  });

  test("ett utkast som säljaren sparade utan kund får aldrig sin kund den här vägen", async () => {
    const [placeholder] = await requireDb()<{ id: string }[]>`select id from customers where reseller_id = ${tenant} and email = ${UNASSIGNED_CUSTOMER_EMAIL}`;
    assert.ok(placeholder);
    const { quoteNo, token } = await createQuote({ tenant, customerId: placeholder.id, badges: [badge], demo: false, manual: true, unassigned: true });
    const draft = await getQuoteByToken(token);
    assert.ok(draft);
    const result = await acceptCustomerQuote(draft, { company: "Holm & Söner AB", orgNumber: "556111-2222", name: "Sam Holm", email: "sam@exempel.invalid" }, address, null, null);
    assert.equal(result.ok, false);
    assert.equal((await getQuote(tenant, quoteNo))?.noCustomer, true);
  });

  test("en offert som säljaren har gjort visar kundens uppgifter som förut", async () => {
    const customer = await upsertCustomer(tenant, { name: "Alex Lund", email: "alex@exempel.invalid", company: "Lund AB", phone: "08-111 22 33" });
    const { token } = await createQuote({ tenant, customerId: customer.id, badges: [badge], demo: false, manual: true });
    const shown = await getQuoteByToken(token);
    assert.equal(shown?.byCustomer, undefined);
    assert.equal(shown?.customer.phone, "08-111 22 33");
  });

  test("offerter som aldrig fick en kund städas bort långt efter att de har gått ut, och bara de", async () => {
    const old = await saveCustomerQuote({ tenant, badges: [badge] });
    const fresh = await saveCustomerQuote({ tenant, badges: [badge] });
    const customer = await upsertCustomer(tenant, { name: "Kim Ek", email: "kim@exempel.invalid", company: "Ek AB" });
    const kept = await createQuote({ tenant, customerId: customer.id, badges: [badge], demo: false, manual: true });
    const sql = requireDb();
    await sql`update quotes set valid_until = current_date - 200 where quote_no in (${old.quoteNo}, ${kept.quoteNo})`;
    assert.ok((await pruneUnclaimedCustomerQuotes()) >= 1);
    assert.equal(await getQuote(tenant, old.quoteNo), null);
    assert.ok(await getQuote(tenant, fresh.quoteNo));
    // En offert med en kund i registret rörs aldrig, hur gammal den än är.
    assert.ok(await getQuote(tenant, kept.quoteNo));
  });
});
