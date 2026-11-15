import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, test } from "node:test";
import { createBadgeDocument, toOfferedDocument } from "@/engine";
import { DEFAULT_PRICE_MODEL } from "@/engine/default-price-model";
import { requireDb } from "@/lib/db/client";
import { completeCheckout, pruneUnpaidCheckouts, startCheckout, unpaidCheckoutBadges } from "./checkout";

/** Körs bara mot en riktig databas med migreringen `024_…`. Stripe är en påhittad server i testet. */
const url = process.env.DATABASE_URL;

interface FakeSession {
  id: string;
  reference: string;
  amount: number;
  paid: boolean;
}

describe("kortbetalningen från kassa till order", { skip: !url }, () => {
  const email = `kassa-test-${randomUUID().slice(0, 8)}@example.se`;
  const sessions = new Map<string, FakeSession>();
  const saved = { key: process.env.STRIPE_SECRET_KEY, hook: process.env.STRIPE_WEBHOOK_SECRET, api: process.env.STRIPE_API_URL };
  let server: Server;

  const badge = { ...toOfferedDocument(createBadgeDocument(["Test Testsson"])), quantity: 4 };
  const order = {
    customer: { name: "Test Testsson", email },
    badges: [badge],
    delivery: {
      to: "customer" as const,
      address: { name: "Test Testsson", contactName: null, line1: "Testgatan 1", line2: null, zip: "111 22", city: "Teststad", country: "SE" as const, phone: null },
    },
    badgeShot: null,
  };
  const body = (session: FakeSession) => ({
    id: session.id,
    url: `https://stripe.invalid/pay/${session.id}`,
    payment_status: session.paid ? "paid" : "unpaid",
    amount_total: session.amount,
    currency: "sek",
    client_reference_id: session.reference,
    payment_intent: session.paid ? `pi_${session.id.slice(8)}` : null,
  });

  before(async () => {
    server = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        const send = (status: number, value: unknown) => {
          response.writeHead(status, { "content-type": "application/json" });
          response.end(JSON.stringify(value));
        };
        if (request.headers.authorization !== "Bearer sk_test_fake") return send(401, { error: { message: "fel nyckel" } });
        if (request.method === "POST" && request.url === "/v1/checkout/sessions") {
          const form = new URLSearchParams(Buffer.concat(chunks).toString());
          const amount = [...form.entries()].filter(([key]) => key.endsWith("[unit_amount]")).reduce((sum, [, value]) => sum + Number(value), 0);
          const session = { id: `cs_test_${randomUUID().replace(/-/g, "")}`, reference: form.get("client_reference_id") ?? "", amount, paid: false };
          sessions.set(session.id, session);
          return send(200, body(session));
        }
        const session = sessions.get(request.url?.split("/").pop() ?? "");
        return session ? send(200, body(session)) : send(404, { error: { message: "finns inte" } });
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    process.env.STRIPE_SECRET_KEY = "sk_test_fake";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_fake";
    process.env.STRIPE_API_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(async () => {
    const restore = (name: string, value: string | undefined) => (value === undefined ? delete process.env[name] : (process.env[name] = value));
    restore("STRIPE_SECRET_KEY", saved.key);
    restore("STRIPE_WEBHOOK_SECRET", saved.hook);
    restore("STRIPE_API_URL", saved.api);
    await new Promise((resolve) => server.close(resolve));
    const sql = requireDb();
    for (const id of sessions.keys()) await sql`delete from checkouts where session_id = ${id}`;
    await sql`delete from orders where customer_id in (select id from customers where email = ${email})`;
    await sql`delete from customers where email = ${email}`;
    await sql.end();
  });

  const onlySession = () => {
    const session = [...sessions.values()].at(-1);
    assert.ok(session);
    return session;
  };
  // Svaret från databasen görs om till en vanlig lista, så att det går att jämföra med en.
  const ordersFor = async () => [
    ...(await requireDb()<{ order_no: string; payment: { reference?: string; amountOre?: number } | null; total_incl_vat_sek: number }[]>`
      select o.order_no, o.payment, o.total_incl_vat_sek from orders o join customers c on c.id = o.customer_id where c.email = ${email}`),
  ];

  test("kassan sparas och kunden skickas till Stripe, men ingen order finns än", async () => {
    const { url: payUrl } = await startCheckout(order, DEFAULT_PRICE_MODEL);
    const session = onlySession();
    assert.equal(payUrl, `https://stripe.invalid/pay/${session.id}`);
    assert.ok(session.amount > 0);
    assert.deepEqual(await ordersFor(), []);
    // Kunden kan komma tillbaka till sin skylt medan kassan är obetald.
    assert.equal((await unpaidCheckoutBadges(session.reference)).length, 1);
  });

  test("en obetald session lägger ingen order, och en okänd hör inte hit", async () => {
    assert.deepEqual(await completeCheckout(onlySession().id), { status: "unpaid" });
    assert.deepEqual(await completeCheckout("cs_test_finnsintealls"), { status: "unknown" });
    assert.deepEqual(await completeCheckout("../skräp"), { status: "unknown" });
    assert.deepEqual(await ordersFor(), []);
  });

  test("en betald session blir en order med betalningen, och bara en hur många gånger det än körs", async () => {
    const session = onlySession();
    session.paid = true;
    // Webhooken och sidan kunden kommer tillbaka till kan köra samtidigt.
    const [first, second] = await Promise.all([completeCheckout(session.id), completeCheckout(session.id)]);
    assert.equal(first.status, "paid");
    assert.deepEqual(second, first);
    assert.deepEqual(await completeCheckout(session.id), first);
    const orders = await ordersFor();
    assert.equal(orders.length, 1);
    assert.equal(orders[0]?.order_no, first.status === "paid" ? first.orderNumber : null);
    assert.equal(orders[0]?.payment?.amountOre, session.amount);
    assert.equal(orders[0]?.payment?.reference, `pi_${session.id.slice(8)}`);
    // Ordern har samma summa som kunden betalade.
    assert.equal((orders[0]?.total_incl_vat_sek ?? 0) * 100, session.amount);
    // Kassan har släppt kundens uppgifter och går inte att öppna igen.
    assert.deepEqual(await unpaidCheckoutBadges(session.reference), []);
  });

  test("en betalning på fel belopp blir ingen order", async () => {
    await startCheckout(order, DEFAULT_PRICE_MODEL);
    const session = onlySession();
    session.paid = true;
    session.amount -= 100;
    await assert.rejects(completeCheckout(session.id), /stämmer inte med kassan/);
    assert.equal((await ordersFor()).length, 1);
  });

  test("obetalda kassor städas bort när de är gamla, betalda blir kvar", async () => {
    const sql = requireDb();
    const left: (string | null)[] = [];
    for (const id of sessions.keys()) await sql`update checkouts set created_at = now() - interval '8 days' where session_id = ${id}`;
    assert.ok((await pruneUnpaidCheckouts()) >= 1);
    for (const id of sessions.keys()) {
      const rows = await sql<{ order_id: string | null }[]>`select order_id from checkouts where session_id = ${id}`;
      left.push(...rows.map((row) => row.order_id));
    }
    assert.equal(left.length, 1);
    assert.ok(left[0]);
  });
});
