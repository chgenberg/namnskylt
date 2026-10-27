import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ShopFrame } from "@/features/shop/shop-frame";
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
  return {
    title: { absolute: `Namnskyltar · ${shop.profile.name}` },
    description: `Designa och beställ graverade namnskyltar hos ${shop.profile.name}.`,
    robots: { index: false, follow: false },
  };
}

export const dynamic = "force-dynamic";

export default async function ShopLayout({ children, params }: ShopLayoutProps) {
  const shop = await loadShop((await params).slug);
  if (!shop) notFound();
  return <ShopFrame shop={shop}>{children}</ShopFrame>;
}
