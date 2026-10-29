"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createRateLimiter } from "@/lib/ai/rate-limit";
import { FetchBlockedError } from "@/lib/brand/url";
import { requireReseller } from "@/lib/reseller-auth/session";
import { isOwner } from "@/lib/tenants/model";
import { buildShop, refreshShopOptions } from "@/lib/shops/build";
import { isValidDomain, normalizeHost } from "@/lib/shops/host";
import { MAX_LOGO_OPTIONS, SHOP_SLUG, type Shop } from "@/lib/shops/model";
import { isListPrice, MAX_PRICE_PERCENT, MIN_PRICE_PERCENT, shopPriceListSchema } from "@/lib/shops/price-list";
import { deleteShop, domainTaken, getShop, getShopOptions, saveShop } from "@/lib/shops/repository";

const HOUR_MS = 60 * 60 * 1000;
/** Varje butik läser en främmande hemsida och kan kosta en AI-fråga. */
const builds = createRateLimiter({ limit: 30, windowMs: HOUR_MS });

export type BuildShopResult = { ok: true; slug: string; name: string } | { ok: false; error: string };

export async function buildShopAction(url: string): Promise<BuildShopResult> {
  if (!isOwner(await requireReseller())) throw new Error("Bara namnskylt.com har demobutiker");
  const parsed = z.string().trim().min(4).max(300).safeParse(url);
  if (!parsed.success) return { ok: false, error: "Skriv in en webbadress" };
  if (!builds.take("reseller")) return { ok: false, error: "Många butiker på kort tid. Försök igen om en stund." };
  try {
    const shop = await buildShop(parsed.data);
    revalidatePath("/admin/butiker");
    return { ok: true, slug: shop.slug, name: shop.profile.name };
  } catch (error) {
    if (error instanceof FetchBlockedError) return { ok: false, error: "Adressen går inte att hämta. Kontrollera att den stämmer." };
    console.error("Butiken kunde inte byggas", error);
    return { ok: false, error: "Vi kunde inte läsa sidan. Prova startsidan eller en annan adress." };
  }
}

export async function deleteShopAction(slug: string): Promise<{ ok: boolean }> {
  if (!isOwner(await requireReseller())) throw new Error("Bara namnskylt.com har demobutiker");
  if (!SHOP_SLUG.test(slug)) return { ok: false };
  await deleteShop(slug);
  revalidatePath("/admin/butiker");
  return { ok: true };
}

export type ShopSaveResult = { ok: true } | { ok: false; error: string };

async function ownerShop(slug: string): Promise<Shop | null> {
  if (!isOwner(await requireReseller())) throw new Error("Bara namnskylt.com har demobutiker");
  return SHOP_SLUG.test(slug) ? getShop(slug) : null;
}

const hex = z.string().regex(/^#[0-9a-f]{6}$/i);
const lookSchema = z.object({
  logoIndex: z.number().int().min(0).max(MAX_LOGO_OPTIONS - 1).nullable(),
  primaryColor: hex,
  accentColor: hex,
});

/** Logga ur skrapningens förslag och butikens två färger. */
export async function saveShopLookAction(slug: string, input: unknown): Promise<ShopSaveResult> {
  const shop = await ownerShop(slug);
  const parsed = lookSchema.safeParse(input);
  if (!shop || !parsed.success) return { ok: false, error: "Ogiltiga val" };
  const { logoIndex, primaryColor, accentColor } = parsed.data;
  const options = logoIndex === null ? null : await getShopOptions(slug);
  const logo = logoIndex === null ? shop.profile.logo : (options?.logos[logoIndex] ?? null);
  if (logoIndex !== null && !logo) return { ok: false, error: "Loggan finns inte längre — hämta om från hemsidan" };
  await saveShop({ ...shop, profile: { ...shop.profile, logo, primaryColor: primaryColor.toLowerCase(), accentColor: accentColor.toLowerCase() } });
  revalidatePath(`/admin/butiker/${slug}`);
  return { ok: true };
}

export async function refreshShopOptionsAction(slug: string): Promise<ShopSaveResult> {
  const shop = await ownerShop(slug);
  if (!shop) return { ok: false, error: "Butiken finns inte" };
  if (!builds.take("reseller")) return { ok: false, error: "Många hämtningar på kort tid. Försök igen om en stund." };
  try {
    await refreshShopOptions(slug);
  } catch (error) {
    console.error("Hemsidan kunde inte läsas om", error);
    return { ok: false, error: "Hemsidan gick inte att läsa just nu." };
  }
  revalidatePath(`/admin/butiker/${slug}`);
  return { ok: true };
}

export async function saveShopPriceListAction(slug: string, input: unknown): Promise<ShopSaveResult> {
  const shop = await ownerShop(slug);
  const parsed = shopPriceListSchema.safeParse(input);
  if (!shop || !parsed.success) return { ok: false, error: `Procenten ska vara mellan ${MIN_PRICE_PERCENT} och ${MAX_PRICE_PERCENT}` };
  await saveShop({ ...shop, priceList: isListPrice(parsed.data) ? null : parsed.data });
  revalidatePath(`/admin/butiker/${slug}`);
  return { ok: true };
}

export async function saveShopDomainAction(slug: string, input: unknown): Promise<ShopSaveResult> {
  const shop = await ownerShop(slug);
  const parsed = z.string().max(253).safeParse(input);
  if (!shop || !parsed.success) return { ok: false, error: "Ogiltig adress" };
  const domain = normalizeHost(parsed.data.replace(/^https?:\/\//i, "").split("/")[0]);
  if (domain && !isValidDomain(domain)) return { ok: false, error: "Skriv en adress som skylt.foretaget.se" };
  if (domain && (await domainTaken(domain, slug))) return { ok: false, error: "Adressen används redan av en annan butik" };
  await saveShop({ ...shop, domain: domain || null });
  revalidatePath(`/admin/butiker/${slug}`);
  return { ok: true };
}
