import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { after, describe, test } from "node:test";
import type { Sql } from "postgres";
import { badgeDocumentSchema, createBadgeDocument } from "@/engine";
import { requireDb } from "@/lib/db/client";
import { customerErasurePlan, eraseCustomer } from "./erase";
import { ERASED_CUSTOMER_NAME, ERASED_TEXT, erasedCustomerEmail } from "./erase-model";
import { getCustomer, getOrder } from "./repository";

/** Körs bara mot en riktig databas med migreringen `024_payments_erasure_originals_errors`. */
const url = process.env.DATABASE_URL;

type Json = Parameters<Sql["json"]>[0];

const BADGES = [{ ...createBadgeDocument(["Anna Lind", "Projektledare"]), quantity: 2 }];
const DELIVERY = {
  to: "customer",
  method: "pickup",
  address: { name: "Exempel AB", contactName: "Anna Lind", line1: "Storgatan 1", line2: null, zip: "111 22", city: "Stockholm", country: "SE", phone: "070-000 00 00" },
};

describe("radering av en kund i databasen", { skip: !url }, () => {
  const tenant = `erase-test-${randomUUID().slice(0, 8)}`;
  const other = `${tenant}-annan`;

  async function customer(sql: Sql, reseller: string, company: string | null): Promise<string> {
    const [row] = await sql<{ id: string }[]>`
      insert into customers (reseller_id, email, name, company, phone, org_number, address)
      values (${reseller}, ${`${randomUUID()}@exempel.se`}, 'Anna Lind', ${company}, '070-000 00 00', ${company ? "556000-0000" : null}, 'Storgatan 1')
      returning id`;
    assert.ok(row);
    return row.id;
  }

  async function order(
    sql: Sql,
    reseller: string,
    customerId: string,
    fields: { status?: string; sent?: boolean; paid?: boolean; demo?: boolean; repeatOf?: string | null } = {},
  ): Promise<{ id: string; orderNo: string }> {
    const [row] = await sql<{ id: string; order_no: string }[]>`
      insert into orders (customer_id, status, badges, total_sek, total_incl_vat_sek, reseller_id, is_demo, badge_shot, delivery,
                          supplier_sent_at, supplier_order_no, payment, repeat_of)
      values (${customerId}, ${fields.status ?? "received"}, ${sql.json(BADGES as unknown as Json)}, 463, 579, ${reseller},
              ${fields.demo ?? false}, 'data:image/jpeg;base64,AAAA', ${sql.json(DELIVERY as unknown as Json)},
              ${fields.sent ? new Date() : null}, ${fields.sent ? "SG-1001" : null},
              ${fields.paid ? sql.json({ method: "card" }) : null}, ${fields.repeatOf ?? null})
      returning id, order_no`;
    assert.ok(row);
    await sql`insert into order_events (order_id, status, note) values (${row.id}, 'received', 'Kunden Anna Lind ringde')`;
    return { id: row.id, orderNo: row.order_no };
  }

  async function quote(sql: Sql, reseller: string, customerId: string, orderId: string | null = null): Promise<string> {
    const [row] = await sql<{ id: string }[]>`
      insert into quotes (customer_id, badges, total_sek, total_incl_vat_sek, valid_until, token, order_id, reseller_id)
      values (${customerId}, ${sql.json(BADGES as unknown as Json)}, 463, 579, current_date + 30, ${randomBytes(16).toString("hex")}, ${orderId}, ${reseller})
      returning id`;
    assert.ok(row);
    return row.id;
  }

  const count = async (sql: Sql, table: "orders" | "quotes" | "customers" | "designs", customerId: string): Promise<number> => {
    const column = table === "customers" ? sql`id` : sql`customer_id`;
    const [row] = await sql<{ count: number }[]>`select count(*)::int as count from ${sql(table)} where ${column} = ${customerId}`;
    return row?.count ?? 0;
  };

  after(async () => {
    const sql = requireDb();
    const tenants = sql([tenant, other]);
    await sql`delete from checkouts where order_id in (select id from orders where reseller_id in ${tenants})`;
    await sql`update orders set repeat_of = null where reseller_id in ${tenants}`;
    await sql`delete from quotes where reseller_id in ${tenants}`;
    await sql`delete from orders where reseller_id in ${tenants}`;
    await sql`delete from customers where reseller_id in ${tenants}`;
    await sql`delete from notices where reseller_id in ${tenants}`;
    await sql.end();
  });

  test("en kund utan bokföringsordrar försvinner helt, med offerter, mallar och ordrar", async () => {
    const sql = requireDb();
    const id = await customer(sql, tenant, "Exempel AB");
    const neighbour = await customer(sql, tenant, "Granne AB");
    const received = await order(sql, tenant, id);
    await order(sql, tenant, id, { status: "cancelled", sent: true });
    await order(sql, tenant, id, { status: "delivered", demo: true });
    const quoteId = await quote(sql, tenant, id, received.id);
    await quote(sql, tenant, id);
    await sql`insert into designs (customer_id, name, doc) values (${id}, 'Mall', ${sql.json(BADGES[0] as unknown as Json)})`;
    await sql`insert into notices (reseller_id, kind, who, order_id) values (${tenant}, 'order-placed', 'Anna Lind', ${received.id})`;
    await sql`insert into notices (reseller_id, kind, who, quote_id) values (${tenant}, 'quote-accepted', 'Anna Lind', ${quoteId})`;
    // Grannens order är en upprepning av en order som tas bort, och grannens offert pekar på den.
    const repeat = await order(sql, tenant, neighbour, { repeatOf: received.id });
    const neighbourQuote = await quote(sql, tenant, neighbour, received.id);

    assert.deepEqual(await customerErasurePlan(tenant, id), { quotes: 2, designs: 1, ordersRemoved: 3, ordersKept: 0 });
    // Fel återförsäljare når inte kunden, och inget ändras.
    assert.equal(await customerErasurePlan(other, id), null);
    assert.equal(await eraseCustomer(other, id), null);
    assert.equal(await eraseCustomer(tenant, "inte-ett-id"), null);
    assert.equal(await count(sql, "orders", id), 3);

    assert.deepEqual(await eraseCustomer(tenant, id), { quotes: 2, designs: 1, ordersRemoved: 3, ordersKept: 0 });
    for (const table of ["orders", "quotes", "customers", "designs"] as const) assert.equal(await count(sql, table, id), 0, table);
    const [notices] = await sql<{ count: number }[]>`select count(*)::int as count from notices where reseller_id = ${tenant}`;
    assert.equal(notices?.count, 0);

    // Grannen står kvar, utan länkarna till den borttagna ordern.
    const [kept] = await sql<{ repeat_of: string | null }[]>`select repeat_of from orders where id = ${repeat.id}`;
    assert.deepEqual(kept, { repeat_of: null });
    const [keptQuote] = await sql<{ order_id: string | null }[]>`select order_id from quotes where id = ${neighbourQuote}`;
    assert.deepEqual(keptQuote, { order_id: null });
    assert.equal(await count(sql, "customers", neighbour), 1);
    // Samma kund en gång till finns inte.
    assert.equal(await eraseCustomer(tenant, id), null);
  });

  test("ordrar som hör till bokföringen behålls utan personuppgifter och kunden avidentifieras", async () => {
    const sql = requireDb();
    const id = await customer(sql, tenant, "Exempel AB");
    const sent = await order(sql, tenant, id, { sent: true });
    const paid = await order(sql, tenant, id, { paid: true });
    const produced = await order(sql, tenant, id, { status: "in-production" });
    const removed = await order(sql, tenant, id, { status: "approved" });
    await quote(sql, tenant, id, sent.id);
    await sql`insert into proofs (token, order_id, status, comment) values (${randomBytes(16).toString("hex")}, ${sent.id}, 'changes', 'Anna Lind ska stå med versaler')`;
    await sql`insert into notices (reseller_id, kind, who, order_id) values (${tenant}, 'proof-changes', 'Anna Lind', ${sent.id})`;
    const [checkout] = await sql<{ id: string }[]>`
      insert into checkouts (payload, price_model, amount_ore, order_id, completed_at)
      values (${sql.json({ customer: { name: "Anna Lind" } })}, '{}'::jsonb, 57900, ${paid.id}, now())
      returning id`;
    assert.ok(checkout);

    assert.deepEqual(await customerErasurePlan(tenant, id), { quotes: 1, designs: 0, ordersRemoved: 1, ordersKept: 3 });
    assert.deepEqual(await eraseCustomer(tenant, id), { quotes: 1, designs: 0, ordersRemoved: 1, ordersKept: 3 });

    const [row] = await sql<{ name: string; email: string; phone: string | null; address: string | null; company: string | null; org_number: string | null; erased: boolean }[]>`
      select name, email, phone, address, company, org_number, erased_at is not null as erased from customers where id = ${id}`;
    assert.deepEqual(row, {
      name: ERASED_CUSTOMER_NAME,
      email: erasedCustomerEmail(id),
      phone: null,
      address: null,
      company: "Exempel AB",
      org_number: "556000-0000",
      erased: true,
    });
    assert.equal(await count(sql, "quotes", id), 0);
    const [gone] = await sql`select 1 from orders where id = ${removed.id}`;
    assert.equal(gone, undefined);

    for (const kept of [sent, paid, produced]) {
      const [stored] = await sql<{ badge_shot: string | null; badges: unknown; delivery: typeof DELIVERY | null; total_sek: number }[]>`
        select badge_shot, badges, delivery, total_sek from orders where id = ${kept.id}`;
      assert.ok(stored);
      assert.equal(stored.badge_shot, null);
      assert.equal(stored.total_sek, 463);
      assert.equal(JSON.stringify(stored).includes("Anna"), false);
      assert.equal(JSON.stringify(stored).includes("070"), false);
      assert.equal(stored.delivery?.method, "pickup");
      assert.equal(stored.delivery?.address.line1, "Storgatan 1");
      const [badge] = stored.badges as unknown[];
      const parsed = badgeDocumentSchema.safeParse(badge);
      assert.equal(parsed.success, true);
      assert.deepEqual(parsed.data?.rows.map((r) => r.text), [ERASED_TEXT, ""]);
      assert.equal(parsed.data?.quantity, 2);
    }
    const notes = await sql<{ note: string | null }[]>`select note from order_events where order_id in ${sql([sent.id, paid.id, produced.id])}`;
    assert.equal(notes.length, 3);
    assert.ok(notes.every((event) => event.note === null));
    const [proof] = await sql<{ comment: string | null; status: string }[]>`select comment, status from proofs where order_id = ${sent.id}`;
    assert.deepEqual(proof, { comment: null, status: "changes" });
    const [notices] = await sql<{ count: number }[]>`select count(*)::int as count from notices where order_id = ${sent.id}`;
    assert.equal(notices?.count, 0);
    const [scrubbed] = await sql<{ payload: unknown; done: boolean }[]>`select payload, completed_at is not null as done from checkouts where id = ${checkout.id}`;
    assert.deepEqual(scrubbed, { payload: {}, done: true });

    // Ordern går fortfarande att läsa i panelen, med samma summa och kunden utan namn.
    const read = await getOrder(tenant, sent.orderNo);
    assert.equal(read?.customer.name, ERASED_CUSTOMER_NAME);
    assert.equal(read?.badges.length, 1);
    assert.equal(read?.totalSek, 463);
    assert.equal(read?.hasBadgeShot, false);
    assert.equal((await getCustomer(tenant, id))?.email, erasedCustomerEmail(id));
  });

  test("en privatpersons leveransadress ersätts helt i en order som behålls", async () => {
    const sql = requireDb();
    const id = await customer(sql, tenant, null);
    const kept = await order(sql, tenant, id, { status: "delivered" });
    assert.deepEqual(await eraseCustomer(tenant, id), { quotes: 0, designs: 0, ordersRemoved: 0, ordersKept: 1 });
    const [stored] = await sql<{ delivery: typeof DELIVERY }[]>`select delivery from orders where id = ${kept.id}`;
    assert.equal(stored?.delivery.address.name, ERASED_CUSTOMER_NAME);
    assert.equal(stored?.delivery.method, "pickup");
    assert.equal(JSON.stringify(stored).includes("Storgatan"), false);
    assert.equal(JSON.stringify(stored).includes("111 22"), false);
    // Ordern läses fortfarande med sitt fraktsätt, så att frakten räknas som förut.
    assert.equal((await getOrder(tenant, kept.orderNo))?.delivery?.method, "pickup");
  });
});
