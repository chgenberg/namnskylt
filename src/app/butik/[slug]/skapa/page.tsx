import { notFound } from "next/navigation";
import { preloadDesignerAssets } from "@/features/designer/assets";
import { Designer } from "@/features/designer/designer";
import { ShopPriceProvider } from "@/features/designer/shop-price";
import { ShopBeacon } from "@/features/shop/shop-beacon";
import { getShop } from "@/lib/shops/repository";
import { decodeShareCode } from "@/lib/share/share-link";
import { engravingFontFor } from "@/lib/shops/typeface";

interface ShopDesignerPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ t?: string | string[]; d?: string | string[] }>;
}

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function ShopDesignerPage({ params, searchParams }: ShopDesignerPageProps) {
  preloadDesignerAssets();
  const [shop, query] = await Promise.all([getShop((await params).slug), searchParams]);
  if (!shop) notFound();
  const shared = await decodeShareCode(first(query.d));
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
