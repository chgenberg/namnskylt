import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, test } from "node:test";
import { createBadgeDocument, toOfferedDocument } from "@/engine";
import { requireDb } from "@/lib/db/client";
import { createQuote, getQuote, getQuoteByToken, updateQuote } from "@/lib/quotes/repository";
import { placeOrder } from "./place-order";
import { getOrder, getOrderByCustomerToken, upsertCustomer } from "./repository";

/** Körs bara mot en riktig databas med migreringen `035_customer_po`. Demoordrar skickas aldrig till verkstaden. */
const url = process.env.DATABASE_URL;

describe("inköpsnumret följer ordern och offerten", { skip: !url }, () => {
  const tenant = `inkopstest-${randomUUID().slice(0, 8)}`;
  const badge = { ...toOfferedDocument(createBadgeDocument(["Test Testsson", "Säljare"])), quantity: 2 };

  after(async () => {
    const sql = requireDb();
    await sql`delete from quotes where reseller_id = ${tenant}`;
    await sql`delete from orders where reseller_id = ${tenant}`;
    await sql`delete from customers where reseller_id = ${tenant}`;
    await sql.end();
  });

  test("en order sparar numret, och kunden ser det på sin ordersida", async () => {
    const placed = await placeOrder({ tenant, customer: { name: "Kund AB", email: "", company: "Kund AB" }, badges: [badge], source: "reseller", demo: true, customerPo: "  4500 012345 " });
    const order = await getOrder(tenant, placed.orderNumber);
    assert.equal(order?.customerPo, "4500 012345");
    assert.ok(placed.customerToken);
    assert.equal((await getOrderByCustomerToken(placed.customerToken))?.customerPo, "4500 012345");
    // Utan nummer sparas inget.
    const plain = await placeOrder({ tenant, customer: { name: "Annan AB", email: "", company: "Annan AB" }, badges: [badge], source: "reseller", demo: true });
    assert.equal((await getOrder(tenant, plain.orderNumber))?.customerPo, null);
  });

  test("en offert sparar numret, och det går att ändra och ta bort", async () => {
    const customer = await upsertCustomer(tenant, { name: "Offertkund AB", email: "", company: "Offertkund AB" });
    const { quoteNo, token } = await createQuote({ tenant, customerId: customer.id, badges: [badge], demo: false, manual: true, customerPo: "PO-77" });
    assert.equal((await getQuote(tenant, quoteNo))?.customerPo, "PO-77");
    assert.equal((await getQuoteByToken(token))?.customerPo, "PO-77");
    // Villkoren sparas utan att numret nämns: då står det kvar.
    assert.equal(await updateQuote(tenant, quoteNo, { project: "Skyltar till mässan" }), true);
    assert.equal((await getQuote(tenant, quoteNo))?.customerPo, "PO-77");
    assert.equal(await updateQuote(tenant, quoteNo, { customerPo: "PO-78" }), true);
    assert.equal((await getQuote(tenant, quoteNo))?.customerPo, "PO-78");
    assert.equal(await updateQuote(tenant, quoteNo, { customerPo: null }), true);
    assert.equal((await getQuote(tenant, quoteNo))?.customerPo, null);
  });
});
