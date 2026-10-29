import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import { EMBED_ROOT_ID, EmbedResize } from "@/features/embed/embed-resize";
import { HomeHero } from "@/features/home/home-hero";
import { ShopBeacon } from "@/features/shop/shop-beacon";
import { databaseConfigured } from "@/lib/orders/repository";
import { googleFontsHref, SHOP_SLUG, shopThemeVars, shopWebFamilies } from "@/lib/shops/model";
import { getShop } from "@/lib/shops/repository";
import { engravingFontFor } from "@/lib/shops/typeface";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Skylten på återförsäljarens egen sajt — laddas i en ram av /embed.js. */
export default async function EmbedPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const shop = databaseConfigured() && SHOP_SLUG.test(slug) ? await getShop(slug) : null;
  if (!shop) notFound();
  return (
    <div id={EMBED_ROOT_ID} style={shopThemeVars(shop) as CSSProperties}>
      {shopWebFamilies(shop.font).map((family) => (
        <link key={family} rel="stylesheet" href={googleFontsHref(family)} precedence="default" />
      ))}
      {/* Ramen ska ta återförsäljarens bakgrund, inte vår. */}
      <style>{"html,body{background:transparent!important}"}</style>
      <EmbedResize />
      <ShopBeacon slug={shop.slug} kind="embed" />
      <HomeHero
        createPath={`/butik/${shop.slug}/skapa`}
        eyebrow={`Graverade namnskyltar från ${shop.profile.name}`}
        branded
        embedded
        badgeFont={engravingFontFor(shop.font)}
      />
    </div>
  );
}
