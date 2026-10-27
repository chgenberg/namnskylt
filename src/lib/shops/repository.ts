import "server-only";
import type { Sql } from "postgres";
import { requireDb } from "@/lib/db/client";
import { shopSchema, slugify, type Shop } from "./model";

type Json = Parameters<Sql["json"]>[0];

function toShop(value: unknown): Shop | null {
  const parsed = shopSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export async function getShop(slug: string): Promise<Shop | null> {
  const sql = requireDb();
  const [row] = await sql<{ data: unknown }[]>`select data from shops where slug = ${slug}`;
  return row ? toShop(row.data) : null;
}

export interface ShopSummary {
  shop: Shop;
  orders: number;
}

export async function listShops(): Promise<ShopSummary[]> {
  const sql = requireDb();
  const rows = await sql<{ data: unknown; orders: number }[]>`
    select s.data, (select count(*)::int from orders o where o.shop_slug = s.slug) as orders
      from shops s order by s.created_at desc`;
  return rows.flatMap((row) => {
    const shop = toShop(row.data);
    return shop ? [{ shop, orders: row.orders }] : [];
  });
}

/** Sparar butiken under en ledig adress — samma namn igen får -2, -3 … */
export async function createShop(shop: Omit<Shop, "slug" | "createdAt">): Promise<Shop> {
  const sql = requireDb();
  const base = slugify(shop.profile.name);
  const taken = new Set(
    (await sql<{ slug: string }[]>`select slug from shops where slug = ${base} or slug like ${`${base}-%`}`).map((r) => r.slug),
  );
  let slug = base;
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
  const saved: Shop = shopSchema.parse({ ...shop, slug, createdAt: new Date().toISOString() });
  await sql`insert into shops (slug, data) values (${slug}, ${sql.json(saved as unknown as Json)})`;
  return saved;
}

export async function deleteShop(slug: string): Promise<void> {
  const sql = requireDb();
  await sql`delete from shops where slug = ${slug}`;
}
