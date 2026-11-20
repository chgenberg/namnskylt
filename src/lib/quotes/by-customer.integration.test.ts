import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, test } from "node:test";
import { requireDb } from "@/lib/db/client";
import { plasticBadge } from "@/engine/testing";
import { upsertCustomer } from "@/lib/orders/repository";
import { quoteInfoRows } from "./view";
import { createQuote, getQuote, getQuoteByToken } from "./repository";

/** Körs bara mot en riktig databas. Inget mejl lämnar datorn. */
const url = process.env.DATABASE_URL;

describe("offert som kunden har gjort själv", { skip: !url }, () => {
  const tenant = `kundoffert-${randomUUID().slice(0, 8)}`;
  const badge = { ...plasticBadge(["Test Testsson", "Säljare"]), quantity: 4 };

  after(async () => {
    const sql = requireDb();
    await sql`delete from quotes where reseller_id = ${tenant}`;
    await sql`delete from customers where reseller_id = ${tenant}`;
    await sql.end();
  });

  test("väntar på svar direkt och är märkt som kundens egen", async () => {
    const customer = await upsertCustomer(tenant, { name: "Kim Ek", email: "kim@exempel.invalid", company: "Exempel AB", orgNumber: "556123-4567" });
    const { quoteNo, token } = await createQuote({ tenant, customerId: customer.id, badges: [badge], demo: false, byCustomer: true });
    const quote = await getQuote(tenant, quoteNo);
    assert.ok(quote);
    assert.equal(quote.byCustomer, true);
    assert.equal(quote.status, "sent");
    assert.equal(quote.emailedAt, null);
    assert.match(quote.events.at(-1)?.note ?? "", /Kunden gjorde offerten själv/);
    assert.equal((await getQuoteByToken(token))?.byCustomer, true);
  });

  test("visar aldrig kundregistrets telefon och adress för den som har länken", async () => {
    // Kunden fanns redan hos säljaren, med telefon och adress från en tidigare order.
    const known = await upsertCustomer(tenant, {
      name: "Robin Berg",
      email: "robin@exempel.invalid",
      company: "Berg & Co AB",
      orgNumber: "556765-4321",
      phone: "070-123 45 67",
      address: "Hemliga gatan 1\n123 45 Staden",
    });
    // Någon som bara känner e-postadressen gör en offert med den. Det som fylls i skriver över namnet, inget annat.
    const again = await upsertCustomer(tenant, { name: "Någon Annan", email: "robin@exempel.invalid", company: "Berg & Co AB", orgNumber: "556765-4321" });
    assert.equal(again.id, known.id);
    const { quoteNo, token } = await createQuote({
      tenant,
      customerId: known.id,
      badges: [badge],
      demo: false,
      delivery: { to: "customer", address: null },
      byCustomer: true,
    });

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

  test("en offert som säljaren har gjort visar kundens uppgifter som förut", async () => {
    const customer = await upsertCustomer(tenant, { name: "Alex Lund", email: "alex@exempel.invalid", company: "Lund AB", phone: "08-111 22 33" });
    const { token } = await createQuote({ tenant, customerId: customer.id, badges: [badge], demo: false, manual: true });
    const shown = await getQuoteByToken(token);
    assert.equal(shown?.byCustomer, undefined);
    assert.equal(shown?.customer.phone, "08-111 22 33");
  });
});
