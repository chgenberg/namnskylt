import { notFound } from "next/navigation";
import { preloadDesignerAssets } from "@/features/designer/assets";
import { Designer } from "@/features/designer/designer";
import { ShopPriceProvider } from "@/features/designer/shop-price";
import { ShopBeacon } from "@/features/shop/shop-beacon";
import { badgeDocumentSchema, type BadgeDocument } from "@/engine";
import { db } from "@/lib/db/client";
import { ASSET_ID_PATTERN } from "@/lib/outreach/badge-asset";
import { getAssetBadge } from "@/lib/outreach/repository";
import { getShop } from "@/lib/shops/repository";
import { decodeShareCode } from "@/lib/share/share-link";
import { engravingFontFor } from "@/lib/shops/typeface";

interface ShopDesignerPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ t?: string | string[]; d?: string | string[]; f?: string | string[] }>;
}

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** Skylten från ett återförsäljarmejl (`?f=` = bildens id), validerad som vilket dokument som helst. */
async function outreachBadge(assetId: string | undefined): Promise<BadgeDocument | null> {
  const sql = db();
  if (!assetId || !ASSET_ID_PATTERN.test(assetId) || !sql) return null;
  const parsed = badgeDocumentSchema.safeParse(await getAssetBadge(sql, assetId));
  return parsed.success ? (parsed.data as BadgeDocument) : null;
}

export default async function ShopDesignerPage({ params, searchParams }: ShopDesignerPageProps) {
  preloadDesignerAssets();
  const [shop, query] = await Promise.all([getShop((await params).slug), searchParams]);
  if (!shop) notFound();
  const shared = (await decodeShareCode(first(query.d))) ?? (await outreachBadge(first(query.f)));
  return (
    <main>
      <ShopBeacon slug={shop.slug} kind="design" />
      <ShopPriceProvider priceList={shop.priceList}>
        <Designer
          initialText={first(query.t) ?? ""}
          initialDoc={shared}
          shop={{ slug: shop.slug, name: shop.profile.name, priceList: shop.priceList ?? null }}
          initialFont={engravingFontFor(shop.font)}
        />
      </ShopPriceProvider>
    </main>
  );
}
