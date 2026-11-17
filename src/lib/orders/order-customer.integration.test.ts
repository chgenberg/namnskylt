import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, test } from "node:test";
import { requireDb } from "@/lib/db/client";
import { OWNER_TENANT } from "@/lib/tenants/model";
import { erasedCustomerEmail } from "./erase-model";
import { resolveOrderCustomer } from "./order-customer";

/** Körs bara mot en riktig databas. */
const url = process.env.DATABASE_URL;

describe("kunden för en order eller offert från skyltmotorn", { skip: !url }, () => {
  const run = randomUUID().slice(0, 8);
  const tenant = `kundval-${run}`;
  const email = (name: string) => `kundval-${run}-${name}@exempel.se`;

  after(async () => {
    const sql = requireDb();
    await sql`delete from customers where reseller_id = ${tenant} or email like ${`kundval-${run}-%`}`;
    await sql.end();
  });

  test("en ny kund sparas hos säljaren, och samma e-post igen är samma kund", async () => {
    const first = await resolveOrderCustomer(tenant, { customer: { name: "Anna Lind", email: email("anna").toUpperCase(), company: "Kund AB" } });
    assert.ok(first.ok);
    assert.deepEqual(
      { name: first.customer.name, company: first.customer.company, email: first.customer.email, orgNumber: first.customer.orgNumber },
      { name: "Anna Lind", company: "Kund AB", email: email("anna"), orgNumber: null },
    );
    const again = await resolveOrderCustomer(tenant, { customer: { name: "Anna Berg", email: email("anna"), phone: "070-123 45 67" } });
    assert.ok(again.ok);
    assert.equal(again.customer.id, first.customer.id);
    // Ifyllda uppgifter skriver över, tomma behåller det gamla.
    assert.deepEqual({ name: again.customer.name, company: again.customer.company, phone: again.customer.phone }, { name: "Anna Berg", company: "Kund AB", phone: "070-123 45 67" });
  });

  test("en befintlig kund väljs på sitt id, men bara säljarens egen", async () => {
    const created = await resolveOrderCustomer(tenant, { customer: { name: "Berit Ek", email: email("berit") } });
    assert.ok(created.ok);
    const found = await resolveOrderCustomer(tenant, { customerId: created.customer.id });
    assert.ok(found.ok);
    assert.equal(found.customer.email, email("berit"));
    assert.deepEqual(await resolveOrderCustomer("en-annan-saljare", { customerId: created.customer.id }), { ok: false, error: "Kunden finns inte", status: 404 });
    assert.deepEqual(await resolveOrderCustomer(tenant, { customerId: randomUUID() }), { ok: false, error: "Kunden finns inte", status: 404 });
  });

  test("utan kund går det inte, och en borttagen kund går inte att beställa åt", async () => {
    const none = await resolveOrderCustomer(tenant, {});
    assert.deepEqual({ ok: none.ok, status: none.ok ? 0 : none.status }, { ok: false, status: 400 });
    const [gone] = await requireDb()<{ id: string }[]>`
      insert into customers (reseller_id, email, name) values (${tenant}, ${erasedCustomerEmail(randomUUID())}, 'Borttagen kund') returning id`;
    assert.ok(gone);
    const erased = await resolveOrderCustomer(tenant, { customerId: gone.id });
    assert.deepEqual({ ok: erased.ok, status: erased.ok ? 0 : erased.status }, { ok: false, status: 409 });
  });

  test("organisationsnumret får saknas hos en återförsäljare, men ett ifyllt ska vara rätt", async () => {
    const wrong = await resolveOrderCustomer(tenant, { customer: { name: "Cecilia Dal", email: email("cecilia"), orgNumber: "123" } });
    assert.deepEqual(wrong, { ok: false, error: "Kundens organisationsnummer ska ha tio siffror", status: 400 });
    const right = await resolveOrderCustomer(tenant, { customer: { name: "Cecilia Dal", email: email("cecilia"), orgNumber: "5561234567" } });
    assert.ok(right.ok);
    assert.equal(right.customer.orgNumber, "556123-4567");
  });

  test("hos namnskylt.com krävs företag och organisationsnummer, eftersom verkstaden fakturerar kunden", async () => {
    for (const customer of [
      { name: "Dora Fors", email: email("dora") },
      { name: "Dora Fors", email: email("dora"), orgNumber: "556123-4567" },
      { name: "Dora Fors", email: email("dora"), company: "Fors AB" },
    ]) {
      const missing = await resolveOrderCustomer(OWNER_TENANT, { customer });
      assert.deepEqual({ ok: missing.ok, status: missing.ok ? 0 : missing.status }, { ok: false, status: 400 });
      assert.match(missing.ok ? "" : missing.error, /företag och organisationsnummer/);
    }
    // Ingenting sparas förrän uppgifterna är hela.
    const [none] = await requireDb()`select 1 from customers where email = ${email("dora")}`;
    assert.equal(none, undefined);
    const saved = await resolveOrderCustomer(OWNER_TENANT, { customer: { name: "Dora Fors", email: email("dora"), company: "Fors AB", orgNumber: "556123-4567" } });
    assert.ok(saved.ok);
    assert.deepEqual({ company: saved.customer.company, orgNumber: saved.customer.orgNumber }, { company: "Fors AB", orgNumber: "556123-4567" });
  });

  test("en kund ur listan hos namnskylt.com ska också ha fakturauppgifterna, annars mejlades en offert som inte kan bli en order", async () => {
    const sql = requireDb();
    const [bare] = await sql<{ id: string }[]>`
      insert into customers (reseller_id, email, name) values (${OWNER_TENANT}, ${email("elsa")}, 'Elsa Gran') returning id`;
    const [demo] = await sql<{ id: string }[]>`
      insert into customers (reseller_id, email, name, is_demo) values (${OWNER_TENANT}, ${email("demo")}, 'Demo Kund', true) returning id`;
    assert.ok(bare && demo);
    const refused = await resolveOrderCustomer(OWNER_TENANT, { customerId: bare.id });
    assert.deepEqual({ ok: refused.ok, status: refused.ok ? 0 : refused.status }, { ok: false, status: 400 });
    assert.match(refused.ok ? "" : refused.error, /saknar företag eller organisationsnummer/);
    // En demokund går aldrig till verkstaden.
    assert.equal((await resolveOrderCustomer(OWNER_TENANT, { customerId: demo.id })).ok, true);
    // Samma e-post som ny kund fyller i det som saknades.
    const filled = await resolveOrderCustomer(OWNER_TENANT, { customer: { name: "Elsa Gran", email: email("elsa"), company: "Gran AB", orgNumber: "5561234567" } });
    assert.ok(filled.ok);
    assert.equal(filled.customer.id, bare.id);
    assert.equal((await resolveOrderCustomer(OWNER_TENANT, { customerId: bare.id })).ok, true);
  });

  test("en borttagen kunds rad skrivs aldrig över av en ny kund med samma adress", async () => {
    const sql = requireDb();
    const gone = erasedCustomerEmail(randomUUID());
    const [row] = await sql<{ id: string }[]>`insert into customers (reseller_id, email, name) values (${tenant}, ${gone}, 'Borttagen kund') returning id`;
    assert.ok(row);
    const result = await resolveOrderCustomer(tenant, { customer: { name: "Någon Annan", email: gone.toUpperCase() } });
    assert.deepEqual({ ok: result.ok, status: result.ok ? 0 : result.status }, { ok: false, status: 409 });
    const [after] = await sql<{ name: string }[]>`select name from customers where id = ${row.id}`;
    assert.equal(after?.name, "Borttagen kund");
  });
});
