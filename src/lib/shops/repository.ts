import "server-only";
import type { Sql } from "postgres";
import { requireDb } from "@/lib/db/client";
import { shopOptionsSchema, shopSchema, slugify, type Shop, type ShopOptions } from "./model";

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
export async function createShop(
  shop: Omit<Shop, "slug" | "createdAt">,
  options: ShopOptions | null = null,
): Promise<Shop> {
  const sql = requireDb();
  const base = slugify(shop.profile.name);
  const taken = new Set(
    (await sql<{ slug: string }[]>`select slug from shops where slug = ${base} or slug like ${`${base}-%`}`).map((r) => r.slug),
  );
  let slug = base;
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
  const saved: Shop = shopSchema.parse({ ...shop, slug, createdAt: new Date().toISOString() });
  const savedOptions = options ? shopOptionsSchema.parse(options) : null;
  await sql`insert into shops (slug, data, options)
            values (${slug}, ${sql.json(saved as unknown as Json)}, ${savedOptions ? sql.json(savedOptions as unknown as Json) : null})`;
  return saved;
}

/** Skriver över butiken — slug och skapad-tid ändras aldrig. */
export async function saveShop(shop: Shop): Promise<Shop> {
  const sql = requireDb();
  const saved = shopSchema.parse(shop);
  await sql`update shops set data = ${sql.json(saved as unknown as Json)} where slug = ${saved.slug}`;
  return saved;
}

export async function getShopOptions(slug: string): Promise<ShopOptions | null> {
  const sql = requireDb();
  const [row] = await sql<{ options: unknown }[]>`select options from shops where slug = ${slug}`;
  const parsed = shopOptionsSchema.safeParse(row?.options);
  return parsed.success ? parsed.data : null;
}

export async function saveShopOptions(slug: string, options: ShopOptions): Promise<void> {
  const sql = requireDb();
  const saved = shopOptionsSchema.parse(options);
  await sql`update shops set options = ${sql.json(saved as unknown as Json)} where slug = ${slug}`;
}

/** Butiken som har domänen som egen adress. */
export async function shopSlugForDomain(host: string): Promise<string | null> {
  const sql = requireDb();
  const [row] = await sql<{ slug: string }[]>`select slug from shops where lower(data->>'domain') = ${host.toLowerCase()}`;
  return row?.slug ?? null;
}

export async function domainTaken(host: string, exceptSlug: string): Promise<boolean> {
  const sql = requireDb();
  const [row] = await sql`select 1 from shops where lower(data->>'domain') = ${host.toLowerCase()} and slug <> ${exceptSlug}`;
  return Boolean(row);
}

export async function deleteShop(slug: string): Promise<void> {
  const sql = requireDb();
  await sql`delete from shops where slug = ${slug}`;
}
