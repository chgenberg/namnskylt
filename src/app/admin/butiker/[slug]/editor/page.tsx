import { notFound } from "next/navigation";
import { adminTenant } from "@/features/admin/guard";
import { ShopEditor } from "@/features/shop-editor/shop-editor";
import { canManageShop, getShopContent, listImages, listVersions } from "@/lib/shops/editor-repository";
import { SHOP_SLUG } from "@/lib/shops/model";
import { getShop } from "@/lib/shops/repository";

/** Butikens sidor: block under skylten, egna undersidor, bilder och AI-förslag. */
export default async function ShopEditorPage({ params }: { params: Promise<{ slug: string }> }) {
  const tenant = await adminTenant();
  const { slug } = await params;
  if (!SHOP_SLUG.test(slug) || !(await canManageShop(tenant, slug))) notFound();
  const [shop, stored, versions, images] = await Promise.all([getShop(slug), getShopContent(slug), listVersions(slug), listImages(slug)]);
  if (!shop) notFound();
  return (
    <ShopEditor
      slug={shop.slug}
      shopName={shop.profile.name}
      draft={stored.draft}
      published={stored.published}
      versions={versions}
      images={images}
    />
  );
}
