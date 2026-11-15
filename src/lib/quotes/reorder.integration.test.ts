import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, test } from "node:test";
import { createBadgeDocument, toOfferedDocument } from "@/engine";
import { requireDb } from "@/lib/db/client";
import { createOrder, getOrder, getOrderByCustomerToken, setExpressShipping } from "@/lib/orders/repository";
import { acceptQuote } from "./accept";
import { createReorderQuote } from "./reorder";
import { getQuoteByToken } from "./repository";

/** Körs bara mot en riktig databas med migreringen `028_…`. */
const url = process.env.DATABASE_URL;

describe("kunden beställer fler från sin ordersida", { skip: !url }, () => {
  const tenant = `reorder-test-${randomUUID().slice(0, 8)}`;
  const address = { name: "Exempel AB", contactName: "Test Testsson", line1: "Testgatan 1", line2: null, zip: "111 22", city: "Teststad", country: "SE" as const, phone: null };
  const badge = { ...toOfferedDocument(createBadgeDocument(["Test Testsson", "Säljare"])), quantity: 4 };
  let orderToken = "";
  let firstOrderNo = "";
  let quoteToken = "";
  let newOrderNo = "";

  after(async () => {
    const sql = requireDb();
    await sql`delete from notices where reseller_id = ${tenant}`;
    await sql`delete from quotes where reseller_id = ${tenant}`;
    await sql`delete from orders where reseller_id = ${tenant}`;
    await sql`delete from customers where reseller_id = ${tenant}`;
    await sql.end();
  });

  test("varje order får en egen hemlig länk, och bara rätt kod öppnar den", async () => {
    const saved = await createOrder({
      customer: { name: "Test Testsson", email: "test@example.se", company: "Exempel AB" },
      badges: [badge],
      status: "delivered",
      source: "reseller",
      tenant,
      delivery: { to: "customer", address },
      // En rabatt kunden har fått gäller också när kunden beställer fler.
      pricing: { unitOverrides: [], discountPercent: 10, extras: [] },
    });
    orderToken = saved.customerToken;
    firstOrderNo = saved.orderNo;
    assert.match(orderToken, /^[0-9a-f]{64}$/);
    const order = await getOrderByCustomerToken(orderToken);
    assert.equal(order?.orderNo, saved.orderNo);
    // Kundens sida får aldrig återförsäljarens inköpspriser.
    assert.equal(order?.purchaseList, undefined);
    assert.equal(await getOrderByCustomerToken("0".repeat(64)), null);
    assert.equal(await getOrderByCustomerToken("inte-en-kod"), null);
  });

  test("namnen blir en offert som är klar att godkänna, med samma design, leverans och rabatt", async () => {
    const result = await createReorderQuote(orderToken, "Ny Person, Tekniker\nAnnan Person", 2);
    assert.ok(result.ok);
    quoteToken = result.ok ? result.quotePath.replace("/offert/", "") : "";
    const quote = await getQuoteByToken(quoteToken);
    assert.ok(quote);
    assert.equal(quote.status, "sent");
    assert.equal(quote.resellerId, tenant);
    assert.equal(quote.project, `Fler skyltar, samma design som ${firstOrderNo}`);
    assert.deepEqual(quote.badges.map((b) => b.quantity), [2, 2]);
    assert.equal(quote.badges[0]?.materialId, badge.materialId);
    assert.equal(quote.pricing?.discountPercent, 10);
    assert.deepEqual(quote.delivery, { to: "customer", address });
    assert.match(quote.events.at(-1)?.note ?? "", /Kunden bad om fler skyltar/);
  });

  test("tomma namn och en okänd länk ger ingen offert", async () => {
    assert.deepEqual(await createReorderQuote(orderToken, "   ", 1), { ok: false, error: "Skriv minst ett namn." });
    assert.equal((await createReorderQuote("0".repeat(64), "Anna", 1)).ok, false);
  });

  test("kunden väljer leveranssätt när offerten godkänns, men bara bland de som erbjuds", async () => {
    const quote = await getQuoteByToken(quoteToken);
    assert.ok(quote);
    // En återförsäljares kund erbjuds inte upphämtningen hos verkstaden.
    const pickup = await acceptQuote(tenant, quote.quoteNo, false, null, "pickup");
    assert.equal(pickup.ok, false);
    const accepted = await acceptQuote(tenant, quote.quoteNo, false, null, "express");
    assert.ok(accepted.ok);
    newOrderNo = accepted.ok ? accepted.orderNo : "";
    assert.match(accepted.ok ? (accepted.orderPath ?? "") : "", /^\/order\/[0-9a-f]{64}$/);
    const order = await getOrder(tenant, newOrderNo);
    assert.equal(order?.delivery?.method, "express");
    // Expressfraktens pris är inte satt än, så ordern har ingen frakt.
    assert.equal(order?.shippingSek, 0);
    assert.equal(order?.expressShippingSek, null);
    // Offerten visar samma leverans och summa som ordern fick.
    const after = await getQuoteByToken(quoteToken);
    assert.equal(after?.delivery.method, "express");
    assert.equal(after?.totalSek, order?.totalSek);
  });

  test("expressfraktens pris läggs på ordern och summan räknas om, för kunden och återförsäljaren", async () => {
    const before = await getOrder(tenant, newOrderNo);
    assert.ok(before);
    assert.equal(await setExpressShipping(newOrderNo, 249), true);
    const order = await getOrder(tenant, newOrderNo);
    assert.equal(order?.expressShippingSek, 249);
    assert.equal(order?.shippingSek, 249);
    assert.equal(order?.totalSek, before.totalSek + 249);
    assert.equal(order?.totalInclVatSek, Math.round((before.totalSek + 249) * 1.25));
    assert.match(order?.events.at(-1)?.note ?? "", /Expressfrakt 249 kr/);
    // Samma pris igen ändrar ingenting, och en order utan expressfrakt får inget expresspris.
    assert.equal(await setExpressShipping(newOrderNo, 249), false);
    assert.equal(await setExpressShipping(firstOrderNo, 249), false);
    assert.equal((await getOrder(tenant, firstOrderNo))?.expressShippingSek, null);
  });
});
