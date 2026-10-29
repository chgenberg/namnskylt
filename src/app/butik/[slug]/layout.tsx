import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ShopFrame } from "@/features/shop/shop-frame";
import { siteOrigin } from "@/lib/http/origin";
import { darkPlate, isLightLogo } from "@/lib/images/logo-tone";
import { databaseConfigured } from "@/lib/orders/repository";
import { SHOP_SLUG } from "@/lib/shops/model";
import { getShop } from "@/lib/shops/repository";

interface ShopLayoutProps {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}

async function loadShop(slug: string) {
  if (!databaseConfigured() || !SHOP_SLUG.test(slug)) return null;
  return getShop(slug);
}

export async function generateMetadata({ params }: ShopLayoutProps): Promise<Metadata> {
  const shop = await loadShop((await params).slug);
  if (!shop) return {};
  const description = `Designa och beställ graverade namnskyltar hos ${shop.profile.name}.`;
  const icon = shop.profile.logo ? `/butik/${shop.slug}/ikon` : undefined;
  return {
    title: { absolute: `Namnskyltar · ${shop.profile.name}` },
    description,
    robots: { index: false, follow: false },
    icons: icon ? { icon: [{ url: icon, type: "image/png" }], apple: [{ url: icon }] } : undefined,
    openGraph: {
      title: `Namnskyltar · ${shop.profile.name}`,
      description,
      siteName: shop.profile.name,
      images: [{ url: `${await siteOrigin()}/butik/${shop.slug}/mejlbild` }],
    },
    twitter: { card: "summary_large_image" },
  };
}

export const dynamic = "force-dynamic";

export default async function ShopLayout({ children, params }: ShopLayoutProps) {
  const shop = await loadShop((await params).slug);
  if (!shop) notFound();
  const plate = (await isLightLogo(shop.profile.logo)) ? darkPlate(shop.profile.primaryColor) : null;
  return (
    <ShopFrame shop={shop} logoPlate={plate}>
      {children}
    </ShopFrame>
  );
}
