import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, test } from "node:test";
import { createBadgeDocument, toOfferedDocument } from "@/engine";
import { requireDb } from "@/lib/db/client";
import { placeOrder } from "@/lib/orders/place-order";
import { OWNER_TENANT } from "@/lib/tenants/model";

/**
 * Körs bara mot en riktig databas. Testerna körs utan kopplingen till verkstaden och utan
 * mejlnycklar, så ingen order skickas och inget mejl går iväg.
 */
const url = process.env.DATABASE_URL;

describe("namnskylt.com får besked om varje ny order", { skip: !url }, () => {
  const tenant = `beskedtest-${randomUUID().slice(0, 8)}`;
  const mark = `Beskedkund ${randomUUID().slice(0, 8)} AB`;
  const badge = { ...toOfferedDocument(createBadgeDocument(["Test Testsson", "Säljare"])), quantity: 3 };
  const notices = async (orderNo: string) => {
    const rows = await requireDb()<{ reseller_id: string; kind: string; who: string; detail: string | null }[]>`
      select n.reseller_id, n.kind, n.who, n.detail from notices n join orders o on o.id = n.order_id where o.order_no = ${orderNo} order by n.created_at`;
    // Vanliga objekt, så att jämförelsen inte faller på databasens egen listtyp.
    return rows.map((row) => ({ ...row }));
  };

  after(async () => {
    const sql = requireDb();
    // Beskeden följer med sina ordrar.
    await sql`delete from orders where reseller_id = ${tenant} or customer_id in (select id from customers where company = ${mark})`;
    await sql`delete from customers where reseller_id = ${tenant} or company = ${mark}`;
    await sql.end();
  });

  test("en order hos en återförsäljare ger adminen ett besked som nämner återförsäljaren, inte kunden", async () => {
    const placed = await placeOrder({ tenant, customer: { name: "Hemlig Kund AB", email: "", company: "Hemlig Kund AB" }, badges: [badge], source: "reseller" });
    const rows = await notices(placed.orderNumber);
    assert.deepEqual(rows, [{ reseller_id: OWNER_TENANT, kind: "reseller-order", who: tenant, detail: "3 skyltar" }]);
  });

  test("en återförsäljares kund som godkänner en offert ger också adminen ett besked", async () => {
    const placed = await placeOrder({ tenant, customer: { name: "Annan Kund AB", email: "", company: "Annan Kund AB" }, badges: [badge], source: "quote" });
    assert.equal((await notices(placed.orderNumber)).filter((row) => row.reseller_id === OWNER_TENANT && row.kind === "reseller-order").length, 1);
  });

  test("en order i namnskylt.coms egen panel ger ett besked som nämner kunden", async () => {
    const placed = await placeOrder({ tenant: OWNER_TENANT, customer: { name: mark, email: "", company: mark }, badges: [badge], source: "reseller" });
    assert.deepEqual(await notices(placed.orderNumber), [{ reseller_id: OWNER_TENANT, kind: "order-created", who: mark, detail: "3 skyltar" }]);
  });

  test("en order som kunden själv lägger hos namnskylt.com ger ett besked, inte två", async () => {
    const placed = await placeOrder({ tenant: OWNER_TENANT, customer: { name: mark, email: "", company: mark }, badges: [badge], source: "web" });
    assert.deepEqual((await notices(placed.orderNumber)).map((row) => row.kind), ["order-placed"]);
  });

  test("en demoorder ger inget besked", async () => {
    const placed = await placeOrder({ tenant, customer: { name: "Demo AB", email: "", company: "Demo AB" }, badges: [badge], source: "reseller", demo: true });
    assert.deepEqual(await notices(placed.orderNumber), []);
  });
});
