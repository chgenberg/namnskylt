import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { after, describe, test } from "node:test";
import type { Sql } from "postgres";
import { createBadgeDocument } from "@/engine";
import { requireDb } from "@/lib/db/client";
import { ERASED_CUSTOMER_NAME } from "@/lib/orders/erase-model";
import { OWNER_TENANT } from "@/lib/tenants/model";
import { accountExists, freeTenantId } from "./accounts";
import { accountErasurePlan, eraseAccount, eraseApplication } from "./erase";

/** Körs bara mot en riktig databas med migreringen `024_payments_erasure_originals_errors`. */
const url = process.env.DATABASE_URL;

type Json = Parameters<Sql["json"]>[0];

const BADGES = [{ ...createBadgeDocument(["Anna Lind"]), quantity: 1 }];
const hash = () => randomBytes(32).toString("hex");

describe("radering av konto och ansökan i databasen", { skip: !url }, () => {
  const account = `erase-konto-${randomUUID().slice(0, 8)}`;
  // Ett annat konto vars id slutar på det första: dess inställningar får inte följa med.
  const neighbour = `annan-${account}`;
  const shop = `${account}-butik`;

  async function customer(sql: Sql, reseller: string): Promise<string> {
    const [row] = await sql<{ id: string }[]>`
      insert into customers (reseller_id, email, name, company) values (${reseller}, ${`${randomUUID()}@exempel.se`}, 'Anna Lind', 'Exempel AB')
      returning id`;
    assert.ok(row);
    return row.id;
  }

  async function order(sql: Sql, reseller: string, customerId: string, status: string, shopSlug: string | null = null): Promise<string> {
    const [row] = await sql<{ id: string }[]>`
      insert into orders (customer_id, status, badges, total_sek, total_incl_vat_sek, reseller_id, shop_slug)
      values (${customerId}, ${status}, ${sql.json(BADGES as unknown as Json)}, 252, 315, ${reseller}, ${shopSlug})
      returning id`;
    assert.ok(row);
    return row.id;
  }

  after(async () => {
    const sql = requireDb();
    const tenants = sql([account, neighbour]);
    await sql`delete from quotes where reseller_id in ${tenants}`;
    await sql`delete from orders where reseller_id in ${tenants}`;
    await sql`delete from customers where reseller_id in ${tenants}`;
    await sql`delete from notices where reseller_id in ${tenants} or who like 'Raderingstest%'`;
    await sql`delete from settings where key like ${`%${account}`}`;
    await sql`delete from shops where slug = ${shop}`;
    await sql`delete from reseller_applications where company like 'Raderingstest%'`;
    await sql`delete from reseller_accounts where id in ${tenants}`;
    await sql.end();
  });

  test("kontot försvinner med kunder, inställningar, butik och inlogg, och bokföringsordrar står kvar", async () => {
    const sql = requireDb();
    for (const id of [account, neighbour]) {
      await sql`insert into reseller_accounts (id, name, email, password_hash) values (${id}, 'Raderingstest AB', ${`${id}@exempel.se`}, 'x')`;
      await sql`insert into settings (key, value) values (${`company_profile:${id}`}, '{}'::jsonb), (${`delivery_address:${id}`}, '{}'::jsonb)`;
    }
    await sql`insert into shops (slug, data, owner_id) values (${shop}, ${sql.json({ name: "Raderingstest" })}, ${account})`;
    const [application] = await sql<{ id: string }[]>`
      insert into reseller_applications (company, org_number, contact_name, email, address, status, account_id)
      values ('Raderingstest AB', '556000-0000', 'Anna Lind', ${`${account}@exempel.se`}, 'Storgatan 1', 'approved', ${account})
      returning id`;
    assert.ok(application);
    await sql`insert into reseller_access_links (token_hash, kind, account_id, expires_at) values (${hash()}, 'reset', ${account}, now() + interval '1 day')`;
    await sql`insert into notices (reseller_id, kind, who) values (${account}, 'order-placed', 'Raderingstest kund')`;

    const first = await customer(sql, account);
    const second = await customer(sql, account);
    await order(sql, account, first, "received");
    const kept = await order(sql, account, second, "delivered", shop);
    await sql`
      insert into quotes (customer_id, badges, total_sek, total_incl_vat_sek, valid_until, token, reseller_id)
      values (${first}, ${sql.json(BADGES as unknown as Json)}, 252, 315, current_date + 30, ${hash()}, ${account})`;
    const neighbourCustomer = await customer(sql, neighbour);
    await order(sql, neighbour, neighbourCustomer, "received");

    const expected = { customers: 2, quotes: 1, designs: 0, ordersRemoved: 1, ordersKept: 1, shops: 1 };
    assert.deepEqual(await accountErasurePlan(account), expected);
    // Ägarens id och ett id utan konto går aldrig att ta bort.
    assert.equal(await accountErasurePlan(OWNER_TENANT), null);
    assert.equal(await eraseAccount(OWNER_TENANT), null);
    assert.equal(await eraseAccount("finns-inte-alls"), null);

    assert.deepEqual(await eraseAccount(account), expected);
    assert.equal(await accountExists(account), false);
    const one = async (query: Promise<{ count: number }[]>) => (await query)[0]?.count;
    assert.equal(await one(sql`select count(*)::int as count from settings where key in ${sql([`company_profile:${account}`, `delivery_address:${account}`])}`), 0);
    assert.equal(await one(sql`select count(*)::int as count from shops where slug = ${shop}`), 0);
    assert.equal(await one(sql`select count(*)::int as count from reseller_applications where id = ${application.id}`), 0);
    assert.equal(await one(sql`select count(*)::int as count from reseller_access_links where account_id = ${account}`), 0);
    assert.equal(await one(sql`select count(*)::int as count from notices where reseller_id = ${account}`), 0);
    assert.equal(await one(sql`select count(*)::int as count from quotes where reseller_id = ${account}`), 0);

    // Bokföringsordern står kvar under kontots id, utan butik och med avidentifierad kund.
    const orders = await sql<{ id: string; shop_slug: string | null; name: string }[]>`
      select o.id, o.shop_slug, c.name from orders o join customers c on c.id = o.customer_id where o.reseller_id = ${account}`;
    assert.deepEqual(orders.map((row) => ({ ...row })), [{ id: kept, shop_slug: null, name: ERASED_CUSTOMER_NAME }]);
    assert.equal(await one(sql`select count(*)::int as count from customers where reseller_id = ${account}`), 1);

    // Grannen är orörd, trots att dess id slutar på det borttagna kontots.
    assert.equal(await accountExists(neighbour), true);
    assert.equal(await one(sql`select count(*)::int as count from settings where key like ${`%:${neighbour}`}`), 2);
    assert.equal(await one(sql`select count(*)::int as count from orders where reseller_id = ${neighbour}`), 1);

    // Ett nytt konto får aldrig det borttagna kontots id, eftersom ordern som står kvar då skulle bli dess.
    assert.notEqual(await freeTenantId(account), account);
    assert.equal(await eraseAccount(account), null);
  });

  test("en ansökan tas bort med sin länk och sitt besked", async () => {
    const sql = requireDb();
    const [application] = await sql<{ id: string }[]>`
      insert into reseller_applications (company, org_number, contact_name, email, address, status)
      values ('Raderingstest Sökande AB', '556000-0000', 'Anna Lind', ${`${randomUUID()}@exempel.se`}, 'Storgatan 1', 'approved')
      returning id`;
    assert.ok(application);
    await sql`insert into reseller_access_links (token_hash, kind, application_id, expires_at) values (${hash()}, 'activate', ${application.id}, now() + interval '1 day')`;
    await sql`insert into notices (reseller_id, kind, who, application_id) values (${OWNER_TENANT}, 'application', 'Raderingstest Sökande AB', ${application.id})`;

    assert.equal(await eraseApplication("inte-ett-id"), false);
    assert.equal(await eraseApplication(application.id), true);
    const one = async (query: Promise<{ count: number }[]>) => (await query)[0]?.count;
    assert.equal(await one(sql`select count(*)::int as count from reseller_access_links where application_id = ${application.id}`), 0);
    assert.equal(await one(sql`select count(*)::int as count from notices where application_id = ${application.id}`), 0);
    assert.equal(await eraseApplication(application.id), false);
  });
});
