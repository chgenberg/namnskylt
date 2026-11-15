import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, test } from "node:test";
import { createBadgeDocument } from "@/engine";
import { DEFAULT_COMPANY } from "@/lib/company/profile";
import { requireDb } from "@/lib/db/client";
import type { Delivery } from "@/lib/orders/delivery";
import { createOrder, saveCompanyProfile } from "@/lib/orders/repository";
import { settingsKey } from "@/lib/tenants/model";
import { dispatchOrder } from "./dispatch";
import { dispatchRetryOverview, retryFailedDispatches } from "./retry";

/**
 * Körs bara mot en riktig databas. Verkstaden är en påhittad server på den
 * egna datorn, och `SUPPLIER_API_URL` pekar dit bara i den här testprocessen.
 * Allt görs under en egen återförsäljare, så att inga andra ordrar rörs.
 */
const url = process.env.DATABASE_URL;
const MINUTE_MS = 60_000;

const DELIVERY: Delivery = {
  to: "customer",
  address: { name: "Exempel AB", contactName: null, line1: "Storgatan 1", line2: null, zip: "111 22", city: "Stockholm", country: "SE", phone: null },
};

interface RetryRow {
  supplier_error: string | null;
  supplier_attempts: number;
  supplier_failed_at: Date | null;
  supplier_error_permanent: boolean;
  supplier_sent_at: Date | null;
  supplier_order_no: string | null;
}

describe("nya försök att skicka ordrar till verkstaden", { skip: !url }, () => {
  const id = randomUUID().slice(0, 8);
  const tenant = `retry-test-${id}`;
  const saved = { url: process.env.SUPPLIER_API_URL, key: process.env.SUPPLIER_API_KEY };
  let server: Server;
  /** Det den påhittade verkstaden svarar med just nu. */
  let answer: 200 | 400 | 503 = 200;
  const received: string[] = [];

  const connect = () => {
    process.env.SUPPLIER_API_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    process.env.SUPPLIER_API_KEY = "test";
  };
  const disconnect = () => {
    delete process.env.SUPPLIER_API_URL;
    delete process.env.SUPPLIER_API_KEY;
  };
  const newOrder = async (name: string): Promise<string> => {
    const order = await createOrder({
      customer: { name: "Testkund", email: `kund-${id}@example.se`, company: "Exempel AB" },
      badges: [createBadgeDocument([name])],
      status: "received",
      source: "reseller",
      delivery: DELIVERY,
      tenant,
    });
    return order.orderNo;
  };
  const row = async (orderNo: string): Promise<RetryRow> => {
    const [found] = await requireDb()<RetryRow[]>`
      select supplier_error, supplier_attempts, supplier_failed_at, supplier_error_permanent, supplier_sent_at, supplier_order_no
        from orders where order_no = ${orderNo}`;
    assert.ok(found);
    return found;
  };
  const later = (minutes: number) => new Date(Date.now() + minutes * MINUTE_MS);

  before(async () => {
    server = createServer((request, response) => {
      request.resume();
      request.on("end", () => {
        received.push(String(request.headers["idempotency-key"]));
        response.writeHead(answer, { "content-type": "application/json" });
        response.end(
          answer === 200
            ? JSON.stringify({ orderNumber: `SG-TEST-${received.length}`, status: "received", estimatedShipDate: "2026-11-22" })
            : JSON.stringify({ error: answer === 400 ? "Ogiltig order" : "Nere för underhåll" }),
        );
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    connect();
    await saveCompanyProfile(tenant, { ...DEFAULT_COMPANY, name: "Exempelprofil AB", orgNumber: "556000-0000", email: "order@example.se" });
  });

  after(async () => {
    if (saved.url === undefined) delete process.env.SUPPLIER_API_URL;
    else process.env.SUPPLIER_API_URL = saved.url;
    if (saved.key === undefined) delete process.env.SUPPLIER_API_KEY;
    else process.env.SUPPLIER_API_KEY = saved.key;
    const sql = requireDb();
    await sql`delete from orders where reseller_id = ${tenant}`;
    await sql`delete from customers where reseller_id = ${tenant}`;
    await sql`delete from settings where key = ${settingsKey(tenant, "company_profile")}`;
    await sql.end();
    await new Promise((resolve) => server.close(resolve));
  });

  test("ett fel hos verkstaden sparas med tid och provas igen först efter tio minuter", async () => {
    const orderNo = await newOrder("Anna Lind");
    answer = 503;
    const first = await dispatchOrder(orderNo);
    assert.equal(first.ok, false);
    let saved = await row(orderNo);
    assert.match(saved.supplier_error ?? "", /^Leverantören svarade 503/);
    assert.equal(saved.supplier_attempts, 1);
    assert.equal(saved.supplier_error_permanent, false);
    assert.ok(saved.supplier_failed_at);

    answer = 200;
    // För tidigt: ingenting provas och verkstaden får inget anrop.
    const calls = received.length;
    assert.deepEqual(await retryFailedDispatches({ tenant, now: later(9) }), { connected: true, tried: 0, sent: 0, failed: 0, skipped: 0 });
    assert.equal(received.length, calls);
    assert.equal((await dispatchRetryOverview()).failed >= 1, true);

    assert.deepEqual(await retryFailedDispatches({ tenant, now: later(11) }), { connected: true, tried: 1, sent: 1, failed: 0, skipped: 0 });
    saved = await row(orderNo);
    assert.ok(saved.supplier_sent_at);
    assert.match(saved.supplier_order_no ?? "", /^SG-TEST-/);
    assert.equal(saved.supplier_error, null);
    assert.equal(saved.supplier_attempts, 2);
    // Samma order bär samma nyckel i båda anropen, så den kan aldrig bli två hos verkstaden.
    assert.deepEqual(received.slice(-2), [orderNo, orderNo]);
    // En skickad order provas aldrig igen.
    assert.equal((await retryFailedDispatches({ tenant, now: later(100_000) })).tried, 0);
  });

  test("ett försök som misslyckas igen väntar längre till nästa gång", async () => {
    const orderNo = await newOrder("Bo Ek");
    answer = 503;
    await dispatchOrder(orderNo);
    assert.deepEqual(await retryFailedDispatches({ tenant, now: later(11) }), { connected: true, tried: 1, sent: 0, failed: 1, skipped: 0 });
    assert.equal((await row(orderNo)).supplier_attempts, 2);
    // Efter det andra försöket är väntan 30 minuter, inte 10.
    assert.equal((await retryFailedDispatches({ tenant, now: later(20) })).tried, 0);
    answer = 200;
    assert.equal((await retryFailedDispatches({ tenant, now: later(31) })).sent, 1);
  });

  test("ett nej från verkstaden provas inte om, men går att skicka för hand", async () => {
    const orderNo = await newOrder("Cia Berg");
    answer = 400;
    assert.equal((await dispatchOrder(orderNo)).ok, false);
    const saved = await row(orderNo);
    assert.match(saved.supplier_error ?? "", /^Leverantören svarade 400/);
    assert.equal(saved.supplier_error_permanent, true);
    answer = 200;
    assert.equal((await retryFailedDispatches({ tenant, now: later(100_000) })).tried, 0);
    // Det manuella utskicket från översikten fungerar som förut.
    assert.equal((await dispatchOrder(orderNo)).ok, true);
    assert.ok((await row(orderNo)).supplier_sent_at);
  });

  test("en order som bara väntar rörs aldrig, och inte heller en som har slut på försök eller ett äldre fel utan tid", async () => {
    const sql = requireDb();
    const waiting = await newOrder("Dan Ny");
    const spent = await newOrder("Eva Sist");
    const old = await newOrder("Finn Gammal");
    await sql`update orders set supplier_error = 'Leverantören svarade 503', supplier_attempts = 6, supplier_failed_at = now() - interval '30 days' where order_no = ${spent}`;
    await sql`update orders set supplier_error = 'Leverantören svarade 503', supplier_attempts = 1 where order_no = ${old}`;
    answer = 200;
    const calls = received.length;
    assert.equal((await retryFailedDispatches({ tenant, now: later(100_000) })).tried, 0);
    assert.equal(received.length, calls);
    assert.equal((await row(waiting)).supplier_attempts, 0);
    assert.equal((await row(spent)).supplier_sent_at, null);
    assert.equal((await row(old)).supplier_sent_at, null);
  });

  test("utan kopplingen till verkstaden görs ingenting", async () => {
    const orderNo = await newOrder("Gun Av");
    answer = 503;
    await dispatchOrder(orderNo);
    disconnect();
    try {
      const calls = received.length;
      assert.deepEqual(await retryFailedDispatches({ tenant, now: later(100_000) }), { connected: false, tried: 0, sent: 0, failed: 0, skipped: 0 });
      assert.equal(received.length, calls);
      assert.equal((await row(orderNo)).supplier_attempts, 1);
    } finally {
      connect();
    }
  });
});
