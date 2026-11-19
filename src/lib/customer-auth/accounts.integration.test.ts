import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, test } from "node:test";
import type { Sql } from "postgres";
import { createBadgeDocument } from "@/engine";
import { requireDb } from "@/lib/db/client";
import { eraseCustomer } from "@/lib/orders/erase";
import { attachOrderToAccount, createOrder, getAccountOrder, listAccountOrders } from "@/lib/orders/repository";
import { reorderAccountId } from "@/lib/quotes/repository";
import { OWNER_TENANT } from "@/lib/tenants/model";
import { consumeCustomerAccessLink, createCustomerAccessLink, customerAccessLinkAccount, voidCustomerAccessLinks } from "./access-links";
import {
  authenticateCustomer,
  createCustomerAccount,
  customerAccountExists,
  customerPasswordMatches,
  deleteCustomerAccount,
  getCustomerAccount,
  listCustomerAccounts,
  managedCustomerAccount,
  saveAccountProfile,
  setCustomerPassword,
} from "./accounts";
import { EMPTY_PROFILE } from "./model";
import { customerFromToken, endCustomerSessions, pruneCustomerSessions, signInCustomer } from "./session";

/** Körs bara mot en riktig databas med migreringen `030_customer_accounts`. */
const url = process.env.DATABASE_URL;

type Json = Parameters<Sql["json"]>[0];

const BADGES = [{ ...createBadgeDocument(["Anna Lind"]), quantity: 2 }];
const PASSWORD = "ett-langt-losenord";

describe("kundkonton i databasen", { skip: !url }, () => {
  const run = randomUUID().slice(0, 8);
  const reseller = `kontotest-${run}`;
  // En butik utan ägare säljer som namnskylt.com. Den andra är återförsäljarens.
  const openShop = `kontotest-${run}-ledig`;
  const ownedShop = `kontotest-${run}-agd`;
  const email = (name: string) => `kontotest-${run}-${name}@exempel.se`;

  async function setup(sql: Sql): Promise<void> {
    await sql`insert into reseller_accounts (id, name, email, password_hash) values (${reseller}, 'Kontotest AB', ${email("aterforsaljare")}, 'x')
              on conflict (id) do nothing`;
    for (const [slug, owner] of [
      [openShop, null],
      [ownedShop, reseller],
    ] as const) {
      await sql`insert into shops (slug, data, owner_id) values (${slug}, ${sql.json({ profile: { name: `Butik ${slug}` } } as Json)}, ${owner})
                on conflict (slug) do nothing`;
    }
  }

  async function order(sql: Sql, tenant: string, customerEmail: string, accountId: string | null, status = "received", sent = false): Promise<string> {
    const [customer] = await sql<{ id: string }[]>`
      insert into customers (reseller_id, email, name, company) values (${tenant}, ${customerEmail}, 'Anna Lind', 'Exempel AB')
      on conflict (reseller_id, email) where email <> '' do update set name = excluded.name returning id`;
    assert.ok(customer);
    const [row] = await sql<{ order_no: string }[]>`
      insert into orders (customer_id, status, badges, total_sek, total_incl_vat_sek, reseller_id, account_id, supplier_sent_at)
      values (${customer.id}, ${status}, ${sql.json(BADGES as unknown as Json)}, 252, 315, ${tenant}, ${accountId}, ${sent ? new Date() : null})
      returning order_no`;
    assert.ok(row);
    return row.order_no;
  }

  after(async () => {
    const sql = requireDb();
    const like = `kontotest-${run}-%`;
    await sql`delete from orders where customer_id in (select id from customers where email like ${like} or email like 'borttagen-%' and reseller_id = ${reseller})`;
    await sql`delete from orders where reseller_id = ${reseller}`;
    await sql`delete from orders where account_id in (select id from customer_accounts where email like ${like})`;
    await sql`delete from customers where email like ${like} or reseller_id = ${reseller}`;
    await sql`delete from customer_accounts where email like ${like}`;
    await sql`delete from shops where slug in ${sql([openShop, ownedShop])}`;
    await sql`delete from reseller_accounts where id = ${reseller}`;
    await sql.end();
  });

  test("samma e-post får ett konto på namnskylt.com och ett i varje butik, men bara ett på varje ställe", async () => {
    const sql = requireDb();
    await setup(sql);
    const web = await createCustomerAccount({ shop: null, email: ` ${email("anna").toUpperCase()} `, password: PASSWORD, profile: EMPTY_PROFILE });
    assert.ok(web);
    assert.equal(web.email, email("anna"));
    assert.equal(web.shop, null);
    assert.equal(await createCustomerAccount({ shop: null, email: email("anna"), password: PASSWORD, profile: EMPTY_PROFILE }), null);
    const inShop = await createCustomerAccount({ shop: openShop, email: email("anna"), password: PASSWORD, profile: EMPTY_PROFILE });
    assert.ok(inShop);
    assert.notEqual(inShop.id, web.id);
    assert.equal(await createCustomerAccount({ shop: openShop, email: email("anna"), password: PASSWORD, profile: EMPTY_PROFILE }), null);
    assert.equal(await customerAccountExists(null, email("anna")), true);
    assert.equal(await customerAccountExists(ownedShop, email("anna")), false);
  });

  test("inloggningen kräver rätt lösenord på rätt ställe", async () => {
    const web = await authenticateCustomer(null, email("anna"), PASSWORD);
    assert.ok(web);
    assert.equal(web.shop, null);
    assert.equal(await authenticateCustomer(null, email("anna"), "fel-losenord"), null);
    assert.equal(await authenticateCustomer(ownedShop, email("anna"), PASSWORD), null);
    assert.equal(await authenticateCustomer(null, email("okand"), PASSWORD), null);
    const inShop = await authenticateCustomer(openShop, email("anna"), PASSWORD);
    assert.ok(inShop);
    assert.equal(inShop.shop, openShop);
  });

  test("en inloggning gäller bara där kontot finns, och slutar gälla när inloggningarna tas bort", async () => {
    const account = await authenticateCustomer(openShop, email("anna"), PASSWORD);
    assert.ok(account);
    const cookie = await signInCustomer(account);
    assert.equal(cookie.name, `ns_kund_${openShop}`);
    assert.equal(cookie.options.httpOnly, true);
    assert.equal((await customerFromToken(openShop, cookie.value))?.id, account.id);
    // Kakan från butiken ger ingen inloggning på namnskylt.com eller i en annan butik.
    assert.equal(await customerFromToken(null, cookie.value), null);
    assert.equal(await customerFromToken(ownedShop, cookie.value), null);
    assert.equal(await customerFromToken(openShop, "inte-en-kod"), null);
    assert.equal(await customerFromToken(openShop, undefined), null);
    // Koden ligger aldrig i klartext i databasen.
    const [stored] = await requireDb()`select 1 from customer_sessions where token_hash = ${cookie.value}`;
    assert.equal(stored, undefined);
    await endCustomerSessions(account.id);
    assert.equal(await customerFromToken(openShop, cookie.value), null);
  });

  test("en inloggning som har gått ut gäller inte och rensas bort", async () => {
    const sql = requireDb();
    const account = await authenticateCustomer(null, email("anna"), PASSWORD);
    assert.ok(account);
    const cookie = await signInCustomer(account);
    await sql`update customer_sessions set expires_at = now() - interval '1 minute' where account_id = ${account.id}`;
    assert.equal(await customerFromToken(null, cookie.value), null);
    assert.ok((await pruneCustomerSessions()) >= 1);
    const [left] = await sql<{ count: number }[]>`select count(*)::int as count from customer_sessions where account_id = ${account.id}`;
    assert.equal(left?.count, 0);
  });

  test("uppgifterna och lösenordet går att byta", async () => {
    const account = await authenticateCustomer(null, email("anna"), PASSWORD);
    assert.ok(account);
    const profile = { ...EMPTY_PROFILE, name: "Anna Lind", company: "Exempel AB", orgNumber: "556123-4567" };
    await saveAccountProfile(account.id, profile);
    assert.deepEqual((await getCustomerAccount(account.id))?.profile, profile);
    await setCustomerPassword(account.id, "ett-nytt-losenord");
    assert.equal(await customerPasswordMatches(account.id, "ett-nytt-losenord"), true);
    assert.equal(await customerPasswordMatches(account.id, PASSWORD), false);
    assert.equal(await authenticateCustomer(null, email("anna"), PASSWORD), null);
    await setCustomerPassword(account.id, PASSWORD);
  });

  test("lösenordslänken gäller en gång, och en ny länk gör den gamla ogiltig", async () => {
    const account = await authenticateCustomer(null, email("anna"), PASSWORD);
    assert.ok(account);
    const first = await createCustomerAccessLink(account.id);
    const second = await createCustomerAccessLink(account.id);
    assert.equal(await customerAccessLinkAccount(first.token), null);
    assert.equal(await customerAccessLinkAccount(second.token), account.id);
    assert.equal(await customerAccessLinkAccount("inte-en-kod"), null);
    assert.equal(await consumeCustomerAccessLink(second.token), account.id);
    assert.equal(await consumeCustomerAccessLink(second.token), null);
    assert.equal(await customerAccessLinkAccount(second.token), null);
    // En länk som väntar slutar gälla när kunden själv har bytt lösenord.
    const waiting = await createCustomerAccessLink(account.id);
    await voidCustomerAccessLinks(account.id);
    assert.equal(await customerAccessLinkAccount(waiting.token), null);
    assert.equal(await consumeCustomerAccessLink(waiting.token), null);
  });

  test("kontot ser bara sina egna ordrar, lästa åt kunden", async () => {
    const sql = requireDb();
    const anna = await authenticateCustomer(null, email("anna"), PASSWORD);
    const other = await createCustomerAccount({ shop: null, email: email("berit"), password: PASSWORD, profile: EMPTY_PROFILE });
    assert.ok(anna && other);
    const mine = await order(sql, OWNER_TENANT, email("anna"), anna.id);
    const guest = await order(sql, OWNER_TENANT, email("anna"), null);
    const listed = await listAccountOrders(anna.id);
    assert.deepEqual(listed.map((o) => o.orderNo), [mine]);
    // Kundens läsning bär aldrig inköpspriser.
    assert.equal("purchaseList" in (listed[0] ?? {}), false);
    assert.equal((await getAccountOrder(anna.id, mine))?.orderNo, mine);
    assert.equal(await getAccountOrder(other.id, mine), null);
    // En order utan konto kan läggas på ett konto, men en order byter aldrig konto.
    assert.equal(await attachOrderToAccount(other.id, mine), false);
    assert.equal(await attachOrderToAccount(other.id, guest), true);
    assert.deepEqual((await listAccountOrders(other.id)).map((o) => o.orderNo), [guest]);
  });

  test("en ny order sparas med kontot, och utan konto om kontot inte finns längre", async () => {
    const anna = await authenticateCustomer(null, email("anna"), PASSWORD);
    assert.ok(anna);
    const base = { customer: { name: "Cecilia Ek", email: email("cecilia"), company: "Exempel AB" }, badges: BADGES, status: "received", source: "web", tenant: OWNER_TENANT, demo: true } as const;
    const withAccount = await createOrder({ ...base, accountId: anna.id });
    assert.ok((await listAccountOrders(anna.id)).some((o) => o.orderNo === withAccount.orderNo));
    const gone = await createOrder({ ...base, accountId: randomUUID() });
    const [row] = await requireDb()<{ account_id: string | null }[]>`select account_id from orders where order_no = ${gone.orderNo}`;
    assert.equal(row?.account_id, null);
  });

  test("fler skyltar beställda från kontots order hamnar på samma konto", async () => {
    const sql = requireDb();
    const anna = await authenticateCustomer(null, email("anna"), PASSWORD);
    assert.ok(anna);
    const quote = async (orderNo: string): Promise<string> => {
      const [row] = await sql<{ id: string }[]>`
        insert into quotes (customer_id, badges, total_sek, total_incl_vat_sek, valid_until, token, reseller_id, reorder_of)
        select o.customer_id, o.badges, 252, 315, current_date + 30, ${randomUUID().replace(/-/g, "")}, o.reseller_id, o.id
          from orders o where o.order_no = ${orderNo}
        returning id`;
      assert.ok(row);
      return row.id;
    };
    const mine = await order(sql, OWNER_TENANT, email("gunnel"), anna.id);
    const guest = await order(sql, OWNER_TENANT, email("gunnel"), null);
    assert.equal(await reorderAccountId(await quote(mine)), anna.id);
    assert.equal(await reorderAccountId(await quote(guest)), null);
    assert.equal(await reorderAccountId(randomUUID()), null);
    await sql`delete from quotes where customer_id in (select id from customers where email = ${email("gunnel")})`;
  });

  test("panelens ägare sköter bara sina egna kunders konton", async () => {
    const owned = await createCustomerAccount({ shop: ownedShop, email: email("dora"), password: PASSWORD, profile: { ...EMPTY_PROFILE, name: "Dora Dal" } });
    const web = await authenticateCustomer(null, email("anna"), PASSWORD);
    const open = await authenticateCustomer(openShop, email("anna"), PASSWORD);
    assert.ok(owned && web && open);
    const forOwner = (await listCustomerAccounts(OWNER_TENANT)).map((a) => a.id);
    assert.ok(forOwner.includes(web.id) && forOwner.includes(open.id));
    assert.equal(forOwner.includes(owned.id), false);
    const forReseller = await listCustomerAccounts(reseller);
    assert.deepEqual(forReseller.map((a) => a.id), [owned.id]);
    assert.equal(forReseller[0]?.shop?.name, `Butik ${ownedShop}`);
    assert.equal(forReseller[0]?.name, "Dora Dal");
    assert.equal((await managedCustomerAccount(reseller, owned.id))?.id, owned.id);
    assert.equal(await managedCustomerAccount(reseller, web.id), null);
    assert.equal(await managedCustomerAccount(OWNER_TENANT, owned.id), null);
    assert.equal((await managedCustomerAccount(OWNER_TENANT, open.id))?.id, open.id);
  });

  test("ett borttaget konto lämnar ordrarna kvar hos säljaren", async () => {
    const sql = requireDb();
    const account = await createCustomerAccount({ shop: null, email: email("elsa"), password: PASSWORD, profile: EMPTY_PROFILE });
    assert.ok(account);
    const orderNo = await order(sql, OWNER_TENANT, email("elsa"), account.id);
    const cookie = await signInCustomer(account);
    assert.equal(await deleteCustomerAccount(account.id), true);
    assert.equal(await deleteCustomerAccount(account.id), false);
    assert.equal(await customerFromToken(null, cookie.value), null);
    const [row] = await sql<{ account_id: string | null }[]>`select account_id from orders where order_no = ${orderNo}`;
    assert.ok(row);
    assert.equal(row.account_id, null);
  });

  test("när kunden tas bort försvinner kontot hos samma säljare, också det som kundens ordrar ligger på", async () => {
    const sql = requireDb();
    const account = await createCustomerAccount({ shop: null, email: email("frida"), password: PASSWORD, profile: { ...EMPTY_PROFILE, name: "Frida Fors" } });
    // Samma e-post i återförsäljarens butik är en annan säljares kund och rörs inte.
    const elsewhere = await createCustomerAccount({ shop: ownedShop, email: email("frida"), password: PASSWORD, profile: EMPTY_PROFILE });
    // Den som är inloggad kan beställa med en annan e-post än kontots. Kontot bär ändå kundens uppgifter.
    const other = await createCustomerAccount({ shop: null, email: email("frida-jobb"), password: PASSWORD, profile: { ...EMPTY_PROFILE, name: "Frida Fors" } });
    const bystander = await authenticateCustomer(null, email("berit"), PASSWORD);
    assert.ok(account && elsewhere && other && bystander);
    await order(sql, OWNER_TENANT, email("frida"), account.id);
    // En order som har gått till verkstaden hör till bokföringen och behålls.
    const kept = await order(sql, OWNER_TENANT, email("frida"), other.id, "shipped", true);
    const [customer] = await sql<{ id: string }[]>`select id from customers where reseller_id = ${OWNER_TENANT} and email = ${email("frida")}`;
    assert.ok(customer);
    const erased = await eraseCustomer(OWNER_TENANT, customer.id);
    assert.deepEqual(erased && { removed: erased.ordersRemoved, kept: erased.ordersKept }, { removed: 1, kept: 1 });
    assert.equal(await getCustomerAccount(account.id), null);
    assert.equal(await getCustomerAccount(other.id), null);
    assert.ok(await getCustomerAccount(elsewhere.id));
    // Ett konto som inte har med kunden att göra står kvar.
    assert.ok(await getCustomerAccount(bystander.id));
    const [row] = await sql<{ account_id: string | null }[]>`select account_id from orders where order_no = ${kept}`;
    assert.equal(row?.account_id, null);
    await sql`delete from orders where order_no = ${kept}`;
    await sql`delete from customers where id = ${customer.id}`;
  });
});
