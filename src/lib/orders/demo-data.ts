import type { Sql } from "postgres";
import { priceOrder, type BadgeDocument } from "@/engine";
import { DEMO_ORDERS } from "./demo-orders";
import type { OrderStatus } from "./model";

/**
 * Påhittade kunder och ordrar till återförsäljarens panel, märkta `is_demo`
 * så att de kan tas bort utan att röra riktiga ordrar. Datumen räknas från
 * `now`, så att demon alltid ser aktuell ut.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const FLOW: readonly OrderStatus[] = ["received", "approved", "in-production", "shipped", "delivered"];
const DEMO_TRACKING_URL = "https://tracking.postnord.com/se/?id=00370712345678901234";

type Json = Parameters<Sql["json"]>[0];

function flowUntil(status: OrderStatus): OrderStatus[] {
  const index = FLOW.indexOf(status);
  return index < 0 ? ["received", status] : FLOW.slice(0, index + 1);
}

function mapStatus(status: string): OrderStatus {
  if (status === "in-production") return "in-production";
  if (status === "shipped") return "shipped";
  return "received";
}

export interface DemoPlan {
  email: string;
  customer: string;
  company: string | null;
  badges: BadgeDocument[];
  placedAt: string;
  status: OrderStatus;
}

/** Demoordrarna flyttade till nu, plus en äldre order från två av tre kunder. */
export function demoPlan(now: Date): DemoPlan[] {
  const newest = Math.max(...DEMO_ORDERS.map((o) => Date.parse(o.placedAt)));
  const shift = now.getTime() - DAY_MS * 0.1 - newest;
  const plan = DEMO_ORDERS.flatMap((demo, i) => {
    const base = { email: demo.email, customer: demo.customer, company: demo.company ?? null, badges: [...demo.badges] };
    const current = { ...base, placedAt: new Date(Date.parse(demo.placedAt) + shift).toISOString(), status: mapStatus(demo.status) };
    if (i % 3 === 2) return [current];
    const weeksAgo = 3 + ((i * 2) % 9);
    const older = { ...base, placedAt: new Date(now.getTime() - weeksAgo * 7 * DAY_MS).toISOString(), status: "delivered" as const };
    return [older, current];
  });
  return plan.sort((a, b) => a.placedAt.localeCompare(b.placedAt));
}

export async function insertDemoData(sql: Sql, tenant: string, now: Date = new Date()): Promise<number> {
  return sql.begin(async (tx) => {
    let created = 0;
    for (const order of demoPlan(now)) {
      const price = priceOrder(order.badges);
      const [customer] = await tx<{ id: string }[]>`
        insert into customers (reseller_id, email, name, company, is_demo)
        values (${tenant}, ${order.email}, ${order.customer}, ${order.company}, true)
        on conflict (reseller_id, email) do update set name = excluded.name
        returning id`;
      if (!customer) continue;
      const shipped = order.status === "shipped" || order.status === "delivered";
      const [saved] = await tx<{ id: string }[]>`
        insert into orders (customer_id, status, badges, total_sek, total_incl_vat_sek, supplier_order_no,
                            source, placed_at, tracking_url, is_demo, reseller_id)
        values (${customer.id}, ${order.status}, ${tx.json(order.badges as unknown as Json)},
                ${price.totalSek}, ${price.totalInclVatSek}, 'DEMO', 'web', ${new Date(order.placedAt)},
                ${shipped ? DEMO_TRACKING_URL : null}, true, ${tenant})
        returning id`;
      if (!saved) continue;
      created += 1;
      for (const [step, status] of flowUntil(order.status).entries()) {
        const at = new Date(Math.min(now.getTime(), Date.parse(order.placedAt) + step * 0.8 * DAY_MS));
        await tx`insert into order_events (order_id, status, at) values (${saved.id}, ${status}, ${at})`;
      }
    }
    for (const demo of DEMO_ORDERS.slice(0, 3)) {
      const template = demo.badges[0];
      if (!template) continue;
      await tx`
        insert into designs (customer_id, name, doc)
        select id, ${`${demo.company ?? demo.customer} – standard`}, ${tx.json({ ...template, quantity: 1 } as unknown as Json)}
          from customers where email = ${demo.email} and is_demo and reseller_id = ${tenant}`;
    }
    return created;
  });
}

/** Tar bort allt märkt som demo — ordrar, offerter och kunder — men aldrig riktiga ordrar. */
export async function removeDemoData(sql: Sql, tenant: string): Promise<number> {
  return sql.begin(async (tx) => {
    const demoOrders = tx`select id from orders where is_demo and reseller_id = ${tenant}`;
    await tx`delete from quotes where reseller_id = ${tenant}
               and (is_demo or customer_id in (select id from customers where is_demo and reseller_id = ${tenant}))`;
    await tx`update quotes set order_id = null where order_id in (${demoOrders})`;
    await tx`update orders set repeat_of = null where repeat_of in (${demoOrders})`;
    const removed = await tx`delete from orders where is_demo and reseller_id = ${tenant}`;
    await tx`delete from customers c where c.is_demo and c.reseller_id = ${tenant}
               and not exists (select 1 from orders o where o.customer_id = c.id)`;
    return removed.count;
  });
}

export async function demoOrderCount(sql: Sql, tenant: string): Promise<number> {
  const [row] = await sql<{ count: number }[]>`select count(*)::int as count from orders where is_demo and reseller_id = ${tenant}`;
  return row?.count ?? 0;
}
