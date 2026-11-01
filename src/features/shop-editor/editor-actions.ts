"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { openai } from "@/lib/ai/openai";
import { createRateLimiter } from "@/lib/ai/rate-limit";
import { requireReseller } from "@/lib/reseller-auth/session";
import { editShopContentWithAi } from "@/lib/shops/ai-edit";
import { imagesIn, lockStartPage, shopContentSchema, type ShopContent } from "@/lib/shops/content";
import {
  canManageShop,
  deleteImage,
  discardDraft,
  getShopContent,
  getVersion,
  listImages,
  listVersions,
  publishContent,
  saveDraft,
  type ContentVersion,
} from "@/lib/shops/editor-repository";
import { SHOP_SLUG } from "@/lib/shops/model";
import { getShop } from "@/lib/shops/repository";

const HOUR_MS = 60 * 60 * 1000;
/** Varje förslag är en AI-fråga. */
const aiEdits = createRateLimiter({ limit: 40, windowMs: HOUR_MS });

type Fail = { ok: false; error: string };

async function allowed(slug: string): Promise<string | null> {
  const tenant = await requireReseller();
  return SHOP_SLUG.test(slug) && (await canManageShop(tenant, slug)) ? tenant : null;
}

/** Startsidan är densamma i alla butiker — vad som än skickas in. */
function parse(content: unknown): ShopContent | null {
  const parsed = shopContentSchema.safeParse(content);
  return parsed.success ? lockStartPage(parsed.data) : null;
}

function firstIssue(content: unknown): string {
  const parsed = shopContentSchema.safeParse(content);
  return parsed.success ? "" : (parsed.error.issues[0]?.message ?? "Något fält är fel ifyllt");
}

export async function saveDraftAction(slug: string, content: unknown): Promise<{ ok: true } | Fail> {
  if (!(await allowed(slug))) return { ok: false, error: "Inte behörig" };
  const parsed = parse(content);
  if (!parsed) return { ok: false, error: firstIssue(content) };
  await saveDraft(slug, parsed);
  return { ok: true };
}

export async function publishAction(slug: string, content: unknown): Promise<{ ok: true; versions: ContentVersion[] } | Fail> {
  const tenant = await allowed(slug);
  if (!tenant) return { ok: false, error: "Inte behörig" };
  const parsed = parse(content);
  if (!parsed) return { ok: false, error: firstIssue(content) };
  await publishContent(slug, parsed, tenant);
  revalidatePath(`/butik/${slug}`, "layout");
  return { ok: true, versions: await listVersions(slug) };
}

export async function discardDraftAction(slug: string): Promise<{ ok: true; content: ShopContent } | Fail> {
  if (!(await allowed(slug))) return { ok: false, error: "Inte behörig" };
  await discardDraft(slug);
  return { ok: true, content: (await getShopContent(slug)).published };
}

export async function loadVersionAction(slug: string, id: unknown): Promise<{ ok: true; content: ShopContent } | Fail> {
  if (!(await allowed(slug))) return { ok: false, error: "Inte behörig" };
  const parsed = z.number().int().positive().safeParse(id);
  const content = parsed.success ? await getVersion(slug, parsed.data) : null;
  return content ? { ok: true, content } : { ok: false, error: "Versionen finns inte" };
}

/** En bild som sidan — publicerad eller utkast — fortfarande visar tas inte bort. */
export async function deleteImageAction(slug: string, id: string, draft: unknown): Promise<{ ok: true } | Fail> {
  if (!(await allowed(slug))) return { ok: false, error: "Inte behörig" };
  const stored = await getShopContent(slug);
  const inDraft = parse(draft);
  const used = new Set([...imagesIn(stored.published), ...imagesIn(stored.draft), ...(inDraft ? imagesIn(inDraft) : [])]);
  if (used.has(id)) return { ok: false, error: "Bilden används på en sida. Ta bort den från blocket först." };
  await deleteImage(slug, id);
  return { ok: true };
}

export async function aiEditAction(
  slug: string,
  request: unknown,
  content: unknown,
): Promise<{ ok: true; content: ShopContent; summary: string } | Fail> {
  const tenant = await allowed(slug);
  if (!tenant) return { ok: false, error: "Inte behörig" };
  const wish = z.string().trim().min(3).max(1000).safeParse(request);
  if (!wish.success) return { ok: false, error: "Skriv vad du vill ändra" };
  const current = parse(content);
  if (!current) return { ok: false, error: firstIssue(content) };
  const ai = openai();
  if (!ai) return { ok: false, error: "AI-assistenten är inte påslagen" };
  if (!aiEdits.take(tenant)) return { ok: false, error: "Många förslag på kort tid. Vänta en stund." };
  const [shop, images] = await Promise.all([getShop(slug), listImages(slug)]);
  if (!shop) return { ok: false, error: "Butiken finns inte" };
  const { name, tagline, website, email, phone, address } = shop.profile;
  return editShopContentWithAi(ai, {
    shop: { name, tagline, website, email, phone, address },
    content: current,
    imageIds: images.map((i) => i.id),
    request: wish.data,
  });
}
