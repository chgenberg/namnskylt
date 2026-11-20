import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, test } from "node:test";
import { createBadgeDocument, toOfferedDocument } from "@/engine";
import { requireDb } from "@/lib/db/client";
import { upsertCustomer } from "@/lib/orders/repository";
import { claimForAcceptance, createQuote, deleteQuote, getQuote, releaseAcceptance } from "./repository";

/** Körs bara mot en riktig databas. */
const url = process.env.DATABASE_URL;

describe("en offert tas bort", { skip: !url }, () => {
  const tenant = `raderatest-${randomUUID().slice(0, 8)}`;
  const badge = { ...toOfferedDocument(createBadgeDocument(["Test Testsson", "Säljare"])), quantity: 2 };

  async function newQuote(): Promise<{ quoteNo: string; id: string }> {
    const customer = await upsertCustomer(tenant, { name: "Kund AB", email: "", company: "Kund AB" });
    const { quoteNo } = await createQuote({ tenant, customerId: customer.id, badges: [badge], demo: false, manual: true });
    const quote = await getQuote(tenant, quoteNo);
    assert.ok(quote);
    return { quoteNo, id: quote.id };
  }

  after(async () => {
    const sql = requireDb();
    await sql`delete from quotes where reseller_id = ${tenant}`;
    await sql`delete from customers where reseller_id = ${tenant}`;
    await sql.end();
  });

  test("offerten försvinner med sin historik", async () => {
    const { quoteNo, id } = await newQuote();
    assert.equal(await deleteQuote(tenant, quoteNo), true);
    assert.equal(await getQuote(tenant, quoteNo), null);
    const [events] = await requireDb()<{ count: number }[]>`select count(*)::int as count from quote_events where quote_id = ${id}`;
    assert.equal(events?.count, 0);
    // En gång till finns inget att ta bort.
    assert.equal(await deleteQuote(tenant, quoteNo), false);
  });

  test("en offert som har blivit en order, eller just godkänns, behålls", async () => {
    const { quoteNo, id } = await newQuote();
    // Godkännandet låser offerten som godkänd innan ordern läggs.
    assert.ok(await claimForAcceptance(tenant, quoteNo, true));
    assert.equal(await deleteQuote(tenant, quoteNo), false);
    assert.equal((await getQuote(tenant, quoteNo))?.status, "accepted");
    // Släpps låset, för att ordern inte gick att lägga, går offerten att ta bort igen.
    await releaseAcceptance(id, "sent");
    assert.equal(await deleteQuote(tenant, quoteNo), true);
  });

  test("en annan säljares offert går inte att ta bort", async () => {
    const { quoteNo } = await newQuote();
    assert.equal(await deleteQuote(`${tenant}-annan`, quoteNo), false);
    assert.ok(await getQuote(tenant, quoteNo));
  });
});
