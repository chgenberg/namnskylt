import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ShopBeacon } from "@/features/shop/shop-beacon";
import { ShopPageView } from "@/features/shop/shop-page-view";
import { findPage, PAGE_PATH } from "@/lib/shops/content";
import { getPublishedContent } from "@/lib/shops/editor-repository";
import { SHOP_SLUG } from "@/lib/shops/model";
import { getShop } from "@/lib/shops/repository";
import { engravingFontFor } from "@/lib/shops/typeface";
import { shopContact, todayInSweden } from "@/lib/shops/view";

interface ShopSubpageProps {
  params: Promise<{ slug: string; page: string }>;
}

async function load({ params }: ShopSubpageProps) {
  const { slug, page } = await params;
  if (!SHOP_SLUG.test(slug) || !PAGE_PATH.test(page)) return null;
  const shop = await getShop(slug);
  const content = shop ? await getPublishedContent(slug) : null;
  const found = content ? findPage(content, page) : null;
  return shop && content && found ? { shop, content, page: found } : null;
}

export async function generateMetadata(props: ShopSubpageProps): Promise<Metadata> {
  const loaded = await load(props);
  return loaded ? { title: { absolute: `${loaded.page.label} · ${loaded.shop.profile.name}` } } : {};
}

/** Återförsäljarens egna sidor — Om oss, Kontakt … — byggda fritt av block. */
export default async function ShopSubpage(props: ShopSubpageProps) {
  const loaded = await load(props);
  if (!loaded) notFound();
  const { shop, page } = loaded;
  return (
    <main>
      <ShopBeacon slug={shop.slug} kind="visit" />
      <ShopPageView
        slug={shop.slug}
        name={shop.profile.name}
        badgeFont={engravingFontFor(shop.font)}
        contact={shopContact(shop)}
        blocks={page.blocks}
        today={todayInSweden()}
        howHref={null}
        hero={false}
      />
    </main>
  );
}
