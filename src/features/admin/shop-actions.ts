"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createRateLimiter } from "@/lib/ai/rate-limit";
import { FetchBlockedError } from "@/lib/brand/url";
import { requireReseller } from "@/lib/reseller-auth/session";
import { buildShop } from "@/lib/shops/build";
import { SHOP_SLUG } from "@/lib/shops/model";
import { deleteShop } from "@/lib/shops/repository";

const HOUR_MS = 60 * 60 * 1000;
/** Varje butik läser en främmande hemsida och kan kosta en AI-fråga. */
const builds = createRateLimiter({ limit: 30, windowMs: HOUR_MS });

export type BuildShopResult = { ok: true; slug: string; name: string } | { ok: false; error: string };

export async function buildShopAction(url: string): Promise<BuildShopResult> {
  await requireReseller();
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
  await requireReseller();
  if (!SHOP_SLUG.test(slug)) return { ok: false };
  await deleteShop(slug);
  revalidatePath("/admin/butiker");
  return { ok: true };
}
