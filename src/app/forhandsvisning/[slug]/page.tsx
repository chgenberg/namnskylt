import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PreviewBridge } from "@/features/shop-editor/preview-bridge";
import { darkPlate, isLightLogo } from "@/lib/images/logo-tone";
import { databaseConfigured } from "@/lib/orders/repository";
import { currentTenant } from "@/lib/reseller-auth/session";
import { canManageShop, getShopContent } from "@/lib/shops/editor-repository";
import { SHOP_SLUG } from "@/lib/shops/model";
import { getShop } from "@/lib/shops/repository";
import { engravingFontFor } from "@/lib/shops/typeface";
import { shopContact, todayInSweden } from "@/lib/shops/view";

export const metadata: Metadata = { title: "Förhandsvisning", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Editorns ram: butiken med utkastet. Bara för den som får redigera butiken. */
export default async function PreviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!databaseConfigured() || !SHOP_SLUG.test(slug) || !(await canManageShop(await currentTenant(), slug))) notFound();
  const [shop, stored] = await Promise.all([getShop(slug), getShopContent(slug)]);
  if (!shop) notFound();
  const plate = (await isLightLogo(shop.profile.logo)) ? darkPlate(shop.profile.primaryColor) : null;
  return (
    <PreviewBridge
      shop={shop}
      logoPlate={plate}
      initial={stored.draft}
      badgeFont={engravingFontFor(shop.font)}
      contact={shopContact(shop)}
      today={todayInSweden()}
    />
  );
}
