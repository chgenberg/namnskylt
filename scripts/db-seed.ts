import { priceOrder, type BadgeDocument } from "../src/engine";
import { DEMO_ORDERS } from "../src/features/orders/demo-orders";
import { db } from "../src/lib/db/client";
import { migrate } from "../src/lib/db/migrations";
import type { OrderStatus } from "../src/lib/orders/model";

/**
 * Demodata för lokal utveckling: demoordrarna plus äldre ordrar från samma
 * kunder, så att statistik och "Beställ igen" har något att visa.
 * `--reset` tömmer tabellerna först. Kör aldrig mot produktionen.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const FLOW: readonly OrderStatus[] = ["received", "approved", "in-production", "shipped", "delivered"];

function flowUntil(status: OrderStatus): OrderStatus[] {
  const index = FLOW.indexOf(status);
  return index < 0 ? ["received", status] : FLOW.slice(0, index + 1);
}

function mapStatus(status: string): OrderStatus {
  if (status === "in-production") return "in-production";
  if (status === "shipped") return "shipped";
  return "received";
}

async function main() {
  const sql = db();
  if (!sql) throw new Error("DATABASE_URL saknas");
  if (process.env.NODE_ENV === "production") throw new Error("Seed körs bara lokalt");
  await migrate(sql);

  if (process.argv.includes("--reset")) {
    await sql`truncate proofs, designs, order_events, orders, customers restart identity cascade`;
    await sql`alter sequence order_number_seq restart with 1001`;
  }
  const [{ count } = { count: 0 }] = await sql<{ count: number }[]>`select count(*)::int as count from orders`;
  if (count > 0) {
    console.warn(`Databasen har redan ${count} ordrar — kör med --reset för att börja om.`);
    await sql.end();
    return;
  }

  const now = Date.now();
  const history = DEMO_ORDERS.flatMap((demo, i) => {
    const current = { demo, placedAt: demo.placedAt, status: mapStatus(demo.status) };
    if (i % 3 === 2) return [current];
    // Samma kund beställde för några veckor sedan — så att återkommande kunder syns.
    const weeksAgo = 3 + ((i * 2) % 9);
    const older = { demo, placedAt: new Date(now - weeksAgo * 7 * DAY_MS).toISOString(), status: "delivered" as OrderStatus };
    return [older, current];
  });
  history.sort((a, b) => a.placedAt.localeCompare(b.placedAt));

  for (const { demo, placedAt, status } of history) {
    const badges: BadgeDocument[] = [...demo.badges];
    const price = priceOrder(badges);
    const [customer] = await sql<{ id: string }[]>`
      insert into customers (email, name, company) values (${demo.email}, ${demo.customer}, ${demo.company ?? null})
      on conflict (email) do update set name = excluded.name returning id`;
    if (!customer) continue;
    const [order] = await sql<{ id: string }[]>`
      insert into orders (customer_id, status, badges, total_sek, total_incl_vat_sek, supplier_order_no, source, placed_at, tracking_url)
      values (${customer.id}, ${status}, ${sql.json(badges as unknown as Parameters<typeof sql.json>[0])},
              ${price.totalSek}, ${price.totalInclVatSek}, ${`MOCK-${Math.round(Date.parse(placedAt) / 1000).toString(36).toUpperCase()}`},
              'web', ${new Date(placedAt)},
              ${status === "shipped" || status === "delivered" ? "https://tracking.postnord.com/se/?id=00370712345678901234" : null})
      returning id`;
    if (!order) continue;
    const steps = flowUntil(status);
    for (const [step, s] of steps.entries()) {
      const at = new Date(Date.parse(placedAt) + step * 0.8 * DAY_MS);
      await sql`insert into order_events (order_id, status, at) values (${order.id}, ${s}, ${at})`;
    }
  }

  // Ett par sparade mallar, så att designbiblioteket inte är tomt.
  for (const demo of DEMO_ORDERS.slice(0, 3)) {
    const template = demo.badges[0];
    if (!template) continue;
    await sql`
      insert into designs (customer_id, name, doc)
      select id, ${`${demo.company ?? demo.customer} – standard`}, ${sql.json({ ...template, quantity: 1 } as unknown as Parameters<typeof sql.json>[0])}
        from customers where email = ${demo.email}`;
  }

  const [{ orders } = { orders: 0 }] = await sql<{ orders: number }[]>`select count(*)::int as orders from orders`;
  console.warn(`Seed klar: ${orders} ordrar.`);
  await sql.end();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
