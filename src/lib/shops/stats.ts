import "server-only";
import { requireDb } from "@/lib/db/client";
import type { ShopEventKind } from "./events";

export async function recordShopEvent(slug: string, kind: ShopEventKind): Promise<void> {
  const sql = requireDb();
  await sql`insert into shop_events (shop_slug, kind) select ${slug}, ${kind} where exists (select 1 from shops where slug = ${slug})`;
}

export interface ShopDay {
  /** YYYY-MM-DD i svensk tid. */
  date: string;
  visits: number;
  embeds: number;
  designs: number;
  orders: number;
  salesSek: number;
}

export interface ShopStats {
  days: ShopDay[];
  totals: Omit<ShopDay, "date">;
  /** Andel besök som blev en order; `null` utan besök. */
  conversionPercent: number | null;
}

const TIME_ZONE = "Europe/Stockholm";
const dayKey = (date: Date) => date.toLocaleDateString("sv-SE", { timeZone: TIME_ZONE });

export async function shopStats(slug: string, days = 30): Promise<ShopStats> {
  const sql = requireDb();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const [events, orders] = await Promise.all([
    sql<{ kind: string; at: Date }[]>`select kind, at from shop_events where shop_slug = ${slug} and at >= ${since}`,
    // Summan som sparades med ordern — den räknas aldrig om när prismodellen ändras.
    sql<{ placed_at: Date; total_sek: number }[]>`
      select placed_at, total_sek from orders where shop_slug = ${slug} and placed_at >= ${since} and not is_demo`,
  ]);

  const byDay = new Map<string, ShopDay>();
  for (let i = days - 1; i >= 0; i--) {
    const date = dayKey(new Date(Date.now() - i * 24 * 60 * 60 * 1000));
    byDay.set(date, { date, visits: 0, embeds: 0, designs: 0, orders: 0, salesSek: 0 });
  }
  for (const event of events) {
    const day = byDay.get(dayKey(event.at));
    if (!day) continue;
    if (event.kind === "visit") day.visits++;
    else if (event.kind === "embed") day.embeds++;
    else if (event.kind === "design") day.designs++;
  }
  for (const order of orders) {
    const day = byDay.get(dayKey(order.placed_at));
    if (!day) continue;
    day.orders++;
    day.salesSek += order.total_sek;
  }

  const list = [...byDay.values()];
  const totals = list.reduce(
    (sum, d) => ({
      visits: sum.visits + d.visits,
      embeds: sum.embeds + d.embeds,
      designs: sum.designs + d.designs,
      orders: sum.orders + d.orders,
      salesSek: sum.salesSek + d.salesSek,
    }),
    { visits: 0, embeds: 0, designs: 0, orders: 0, salesSek: 0 },
  );
  const views = totals.visits + totals.embeds;
  return { days: list, totals, conversionPercent: views > 0 ? Math.round((totals.orders / views) * 1000) / 10 : null };
}

