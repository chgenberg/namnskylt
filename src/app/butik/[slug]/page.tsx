import { notFound } from "next/navigation";
import { ShopBeacon } from "@/features/shop/shop-beacon";
import { ShopPageView } from "@/features/shop/shop-page-view";
import { getPublishedContent } from "@/lib/shops/editor-repository";
import { getShop } from "@/lib/shops/repository";
import { engravingFontFor } from "@/lib/shops/typeface";
import { howItWorksHref, shopContact, todayInSweden } from "@/lib/shops/view";

export default async function ShopHomePage({ params }: { params: Promise<{ slug: string }> }) {
  const shop = await getShop((await params).slug);
  if (!shop) notFound();
  const content = await getPublishedContent(shop.slug);
  return (
    <main>
      <ShopBeacon slug={shop.slug} kind="visit" />
      <ShopPageView
        slug={shop.slug}
        name={shop.profile.name}
        badgeFont={engravingFontFor(shop.font)}
        contact={shopContact(shop)}
        blocks={content.pages[0]?.blocks ?? []}
        today={todayInSweden()}
        howHref={howItWorksHref(content, shop.slug, true)}
        hero
      />
    </main>
  );
}
