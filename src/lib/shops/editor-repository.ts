import "server-only";
import { randomBytes } from "node:crypto";
import type { Sql } from "postgres";
import { requireDb } from "@/lib/db/client";
import { isOwner } from "@/lib/tenants/model";
import { contentOrDefault, shopContentSchema, type ShopContent } from "./content";

type Json = Parameters<Sql["json"]>[0];

const KEEP_VERSIONS = 30;
export const MAX_SHOP_IMAGES = 60;
const INVITE_DAYS = 14;

/* ───────── Ägare ───────── */

export async function getShopOwner(slug: string): Promise<string | null> {
  const sql = requireDb();
  const [row] = await sql<{ owner_id: string | null }[]>`select owner_id from shops where slug = ${slug}`;
  return row?.owner_id ?? null;
}

export async function shopOwnerAccount(slug: string): Promise<{ id: string; name: string; email: string } | null> {
  const sql = requireDb();
  const [row] = await sql<{ id: string; name: string; email: string }[]>`
    select a.id, a.name, a.email from shops s join reseller_accounts a on a.id = s.owner_id where s.slug = ${slug}`;
  return row ?? null;
}

export async function shopsOwnedBy(tenant: string): Promise<string[]> {
  const sql = requireDb();
  return (await sql<{ slug: string }[]>`select slug from shops where owner_id = ${tenant} order by created_at`).map((r) => r.slug);
}

/** namnskylt.com hanterar alla butiker; en återförsäljare bara sin egen. */
export async function canManageShop(tenant: string | null, slug: string): Promise<boolean> {
  if (!tenant) return false;
  if (isOwner(tenant)) return true;
  return (await getShopOwner(slug)) === tenant;
}

/* ───────── Innehåll ───────── */

export interface StoredContent {
  /** Det besökarna ser. */
  published: ShopContent;
  /** Det editorn öppnar: utkastet om det finns, annars det publicerade. */
  draft: ShopContent;
  hasDraft: boolean;
}

export async function getShopContent(slug: string): Promise<StoredContent> {
  const sql = requireDb();
  const [row] = await sql<{ content: unknown; draft: unknown }[]>`select content, draft from shops where slug = ${slug}`;
  const published = contentOrDefault(row?.content);
  const draft = shopContentSchema.safeParse(row?.draft);
  return { published, draft: draft.success ? draft.data : published, hasDraft: draft.success };
}

export async function getPublishedContent(slug: string): Promise<ShopContent> {
  const sql = requireDb();
  const [row] = await sql<{ content: unknown }[]>`select content from shops where slug = ${slug}`;
  return contentOrDefault(row?.content);
}

export async function saveDraft(slug: string, content: ShopContent): Promise<void> {
  const sql = requireDb();
  const saved = shopContentSchema.parse(content);
  await sql`update shops set draft = ${sql.json(saved as unknown as Json)} where slug = ${slug}`;
}

export async function publishContent(slug: string, content: ShopContent, by: string): Promise<void> {
  const sql = requireDb();
  const saved = shopContentSchema.parse(content);
  await sql.begin(async (tx) => {
    await tx`update shops set content = ${tx.json(saved as unknown as Json)}, draft = null where slug = ${slug}`;
    await tx`insert into shop_content_versions (shop_slug, content, published_by) values (${slug}, ${tx.json(saved as unknown as Json)}, ${by})`;
    await tx`
      delete from shop_content_versions where shop_slug = ${slug} and id not in (
        select id from shop_content_versions where shop_slug = ${slug} order by published_at desc limit ${KEEP_VERSIONS})`;
  });
}

export async function discardDraft(slug: string): Promise<void> {
  const sql = requireDb();
  await sql`update shops set draft = null where slug = ${slug}`;
}

export interface ContentVersion {
  id: number;
  publishedAt: string;
  publishedBy: string | null;
}

export async function listVersions(slug: string, limit = 15): Promise<ContentVersion[]> {
  const sql = requireDb();
  const rows = await sql<{ id: string; published_at: Date; published_by: string | null }[]>`
    select id, published_at, published_by from shop_content_versions where shop_slug = ${slug}
     order by published_at desc limit ${limit}`;
  return rows.map((r) => ({ id: Number(r.id), publishedAt: r.published_at.toISOString(), publishedBy: r.published_by }));
}

export async function getVersion(slug: string, id: number): Promise<ShopContent | null> {
  const sql = requireDb();
  const [row] = await sql<{ content: unknown }[]>`select content from shop_content_versions where shop_slug = ${slug} and id = ${id}`;
  const parsed = shopContentSchema.safeParse(row?.content);
  return parsed.success ? parsed.data : null;
}

/* ───────── Bilder ───────── */

export interface ShopImage {
  id: string;
  width: number;
  height: number;
}

export async function listImages(slug: string): Promise<ShopImage[]> {
  const sql = requireDb();
  return sql<ShopImage[]>`select id, width, height from shop_images where shop_slug = ${slug} order by created_at desc`;
}

export async function countImages(slug: string): Promise<number> {
  const sql = requireDb();
  const [row] = await sql<{ n: number }[]>`select count(*)::int as n from shop_images where shop_slug = ${slug}`;
  return row?.n ?? 0;
}

export async function saveImage(slug: string, image: { mime: string; bytes: Buffer; width: number; height: number }): Promise<ShopImage> {
  const sql = requireDb();
  const id = randomBytes(12).toString("base64url");
  await sql`insert into shop_images (id, shop_slug, mime, bytes, width, height)
            values (${id}, ${slug}, ${image.mime}, ${image.bytes}, ${image.width}, ${image.height})`;
  return { id, width: image.width, height: image.height };
}

export async function getImage(slug: string, id: string): Promise<{ mime: string; bytes: Buffer } | null> {
  const sql = requireDb();
  const [row] = await sql<{ mime: string; bytes: Buffer }[]>`select mime, bytes from shop_images where shop_slug = ${slug} and id = ${id}`;
  return row ?? null;
}

export async function deleteImage(slug: string, id: string): Promise<void> {
  const sql = requireDb();
  await sql`delete from shop_images where shop_slug = ${slug} and id = ${id}`;
}

/* ───────── Inbjudningar ───────── */

export interface ShopInvite {
  token: string;
  slug: string;
  email: string;
  expiresAt: string;
  used: boolean;
}

export async function createInvite(slug: string, email: string): Promise<ShopInvite> {
  const sql = requireDb();
  const token = randomBytes(18).toString("base64url");
  const expires = new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000);
  await sql`insert into shop_invites (token, shop_slug, email, expires_at) values (${token}, ${slug}, ${email.trim().toLowerCase()}, ${expires})`;
  return { token, slug, email: email.trim().toLowerCase(), expiresAt: expires.toISOString(), used: false };
}

/** Giltig inbjudan, eller `null` om den är använd, utgången eller påhittad. */
export async function getInvite(token: string): Promise<ShopInvite | null> {
  if (!/^[A-Za-z0-9_-]{20,40}$/.test(token)) return null;
  const sql = requireDb();
  const [row] = await sql<{ token: string; shop_slug: string; email: string; expires_at: Date; used_at: Date | null }[]>`
    select token, shop_slug, email, expires_at, used_at from shop_invites where token = ${token}`;
  if (!row || row.used_at || row.expires_at.getTime() < Date.now()) return null;
  return { token: row.token, slug: row.shop_slug, email: row.email, expiresAt: row.expires_at.toISOString(), used: false };
}

/** Kontot tar över butiken; inbjudan går inte att använda igen. */
export async function acceptInvite(token: string, tenant: string): Promise<boolean> {
  const sql = requireDb();
  return sql.begin(async (tx) => {
    const [invite] = await tx<{ shop_slug: string }[]>`
      update shop_invites set used_at = now() where token = ${token} and used_at is null and expires_at > now() returning shop_slug`;
    if (!invite) return false;
    await tx`update shops set owner_id = ${tenant} where slug = ${invite.shop_slug}`;
    return true;
  });
}

export async function releaseShop(slug: string): Promise<void> {
  const sql = requireDb();
  await sql`update shops set owner_id = null where slug = ${slug}`;
}
