import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, test } from "node:test";
import { createBadgeDocument, toOfferedDocument } from "@/engine";
import { requireDb } from "@/lib/db/client";
import { resolveOrderCustomer } from "@/lib/orders/order-customer";
import { getCustomer, listCustomerChoices, listCustomers, unassignedCustomerId, upsertCustomer } from "@/lib/orders/repository";
import { UNASSIGNED_CUSTOMER_EMAIL } from "@/lib/orders/unassigned-customer";
import { acceptQuote } from "./accept";
import { NO_CUSTOMER_ERROR, quoteCustomerLabel } from "./model";
import { assignQuoteCustomer, createQuote, getQuote, getQuoteByToken, listQuotes } from "./repository";
import { sendQuote } from "./send";

/** Körs bara mot en riktig databas. Inget mejl lämnar datorn: offertmejlets nyckel är inte satt. */
const url = process.env.DATABASE_URL;

describe("offert som utkast, utan kund", { skip: !url }, () => {
  const tenant = `utkasttest-${randomUUID().slice(0, 8)}`;
  const badge = { ...toOfferedDocument(createBadgeDocument(["Test Testsson", "Säljare"])), quantity: 4 };

  async function newDraft() {
    return createQuote({ tenant, customerId: await unassignedCustomerId(tenant), badges: [badge], demo: false, manual: true, unassigned: true });
  }

  after(async () => {
    const sql = requireDb();
    await sql`delete from quotes where reseller_id = ${tenant}`;
    await sql`delete from customers where reseller_id = ${tenant}`;
    await sql.end();
  });

  test("sparas som utkast och läses utan kunduppgifter", async () => {
    const { quoteNo, token } = await newDraft();
    const quote = await getQuote(tenant, quoteNo);
    assert.ok(quote);
    assert.equal(quote.noCustomer, true);
    // Ett utkast väntar inte på svar, fast säljaren sparade det själv.
    assert.equal(quote.status, "draft");
    assert.deepEqual(
      { name: quote.customer.name, company: quote.customer.company, email: quote.customer.email },
      { name: "", company: null, email: "" },
    );
    assert.equal(quoteCustomerLabel(quote), "Utan kund");
    // Platshållarens adress följer aldrig med, inte heller via kundens länk.
    assert.ok(!JSON.stringify(await getQuoteByToken(token)).includes(UNASSIGNED_CUSTOMER_EMAIL));
    assert.equal((await listQuotes(tenant)).find((q) => q.quoteNo === quoteNo)?.noCustomer, true);
  });

  test("platshållaren är en per säljare och visas aldrig som kund", async () => {
    const id = await unassignedCustomerId(tenant);
    assert.equal(await unassignedCustomerId(tenant), id);
    assert.equal(await getCustomer(tenant, id), null);
    assert.ok(!(await listCustomers(tenant)).some((customer) => customer.id === id));
    assert.ok(!(await listCustomerChoices(tenant)).some((customer) => customer.id === id));
    // Den går inte att beställa åt, varken som vald kund eller genom sin adress.
    assert.deepEqual(await resolveOrderCustomer(tenant, { customerId: id }), { ok: false, error: "Kunden finns inte", status: 404 });
    const typed = await resolveOrderCustomer(tenant, { customer: { name: "Någon", email: UNASSIGNED_CUSTOMER_EMAIL } });
    assert.equal(typed.ok, false);
  });

  test("går varken att skicka eller godkänna förrän kunden är vald", async () => {
    const { quoteNo } = await newDraft();
    assert.equal(await sendQuote(tenant, quoteNo), null);
    assert.deepEqual(await acceptQuote(tenant, quoteNo, true), { ok: false, error: NO_CUSTOMER_ERROR });
    assert.equal((await getQuote(tenant, quoteNo))?.status, "draft");
  });

  test("får sin kund i panelen, en gång", async () => {
    const { quoteNo } = await newDraft();
    const customer = await upsertCustomer(tenant, { name: "Kund AB", email: "", company: "Kund AB" });
    assert.equal(await assignQuoteCustomer(tenant, quoteNo, customer), true);
    const quote = await getQuote(tenant, quoteNo);
    assert.ok(quote);
    assert.equal(quote.noCustomer, undefined);
    assert.equal(quote.customer.id, customer.id);
    assert.equal(quoteCustomerLabel(quote), "Kund AB");
    assert.equal(quote.events.at(-1)?.note, "Kund vald för offerten");
    // En offert som har en kund byter aldrig kund här.
    const other = await upsertCustomer(tenant, { name: "Annan AB", email: "", company: "Annan AB" });
    assert.equal(await assignQuoteCustomer(tenant, quoteNo, other), false);
    assert.equal((await getQuote(tenant, quoteNo))?.customer.id, customer.id);
  });

  test("en annan säljares kund går inte att välja", async () => {
    const { quoteNo } = await newDraft();
    const foreign = `utkasttest-annan-${randomUUID().slice(0, 8)}`;
    const theirs = await upsertCustomer(foreign, { name: "Deras kund", email: "", company: "Deras AB" });
    try {
      assert.equal(await assignQuoteCustomer(tenant, quoteNo, theirs), false);
      assert.equal((await getQuote(tenant, quoteNo))?.noCustomer, true);
    } finally {
      await requireDb()`delete from customers where reseller_id = ${foreign}`;
    }
  });
});
