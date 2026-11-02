"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { openai } from "@/lib/ai/openai";
import { createRateLimiter } from "@/lib/ai/rate-limit";
import { requireReseller } from "@/lib/reseller-auth/session";
import { editShopContentWithAi } from "@/lib/shops/ai-edit";
import { imagesIn, lockStartPage, MAX_PAGES, shopContentSchema, type ShopContent, type ShopPage } from "@/lib/shops/content";
import {
  canManageShop,
  countImages,
  deleteImage,
  discardDraft,
  getShopContent,
  getVersion,
  listImages,
  listVersions,
  MAX_SHOP_IMAGES,
  publishContent,
  saveDraft,
  type ContentVersion,
  type ShopImage,
} from "@/lib/shops/editor-repository";
import { pageTemplate, templatePage } from "@/lib/shops/page-templates";
import { createShowcaseImages } from "@/lib/shops/showcase-images";
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

const chatSchema = z
  .array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().trim().min(1).max(1200) }))
  .min(1)
  .max(30)
  .refine((turns) => turns.at(-1)?.role === "user", "Sista meddelandet ska vara ditt");
const focusSchema = z.object({ pagePath: z.string().max(40), blockId: z.string().max(32).nullable() });
/** Äldre delar av chatten tar plats utan att hjälpa. */
const CHAT_TURNS_TO_AI = 12;

export async function aiChatAction(
  slug: string,
  conversation: unknown,
  content: unknown,
  focus: unknown,
): Promise<{ ok: true; content: ShopContent | null; reply: string } | Fail> {
  const tenant = await allowed(slug);
  if (!tenant) return { ok: false, error: "Inte behörig" };
  const turns = chatSchema.safeParse(conversation);
  if (!turns.success) return { ok: false, error: "Skriv vad du vill ändra" };
  const where = focusSchema.safeParse(focus);
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
    conversation: turns.data.slice(-CHAT_TURNS_TO_AI),
    focus: where.success ? where.data : { pagePath: "", blockId: null },
  });
}

/**
 * En ny undersida ur en mall. Mallar med exempelbilder får dem ritade med
 * butikens namn — så länge butiken har plats för fler bilder.
 */
export async function createTemplatePageAction(
  slug: string,
  templateId: unknown,
  label: unknown,
  content: unknown,
): Promise<{ ok: true; page: ShopPage; images: ShopImage[] } | Fail> {
  if (!(await allowed(slug))) return { ok: false, error: "Inte behörig" };
  const template = pageTemplate(String(templateId));
  const name = z.string().trim().max(30).safeParse(label);
  const current = parse(content);
  if (!template || !name.success || !current) return { ok: false, error: "Mallen finns inte" };
  if (current.pages.length >= MAX_PAGES) return { ok: false, error: `Butiken har redan ${MAX_PAGES} sidor` };
  const shop = await getShop(slug);
  if (!shop) return { ok: false, error: "Butiken finns inte" };
  const room = MAX_SHOP_IMAGES - (await countImages(slug));
  const images =
    template.showcaseImages > 0 && room >= template.showcaseImages
      ? await createShowcaseImages(slug, shop.profile.name, template.showcaseImages).catch((error) => {
          console.error("Exempelbilderna kunde inte ritas", error);
          return [];
        })
      : [];
  const page = templatePage(
    template.id,
    name.data || template.label,
    { slug, name: shop.profile.name, tagline: shop.profile.tagline, address: shop.profile.address.replace(/\s*\n\s*/g, ", ") },
    current.pages.map((p) => p.path),
    images.map((i) => i.id),
  );
  return { ok: true, page, images };
}
