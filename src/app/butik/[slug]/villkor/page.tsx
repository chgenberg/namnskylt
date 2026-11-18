import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TermsPage } from "@/features/terms/terms-page";
import { getCompanyProfile } from "@/lib/orders/repository";
import { getShopOwner } from "@/lib/shops/editor-repository";
import { getShop } from "@/lib/shops/repository";

export const metadata: Metadata = { title: "Köpvillkor" };

/**
 * Butikens köpvillkor. Säljaren är återförsäljaren som äger butiken. En butik
 * utan ägare säljer som namnskylt.com: där är Skylt & Gravyrteknik säljare.
 */
export default async function ShopTermsPage({ params }: { params: Promise<{ slug: string }> }) {
  const shop = await getShop((await params).slug);
  if (!shop) notFound();
  const owner = await getShopOwner(shop.slug);
  // En butik utan ägare säljer som namnskylt.com: där är Skylt & Gravyrteknik säljare, och inget annat företag visas.
  const seller = owner ? await getCompanyProfile(owner) : null;
  return (
    <main>
      <TermsPage
        seller={seller ? { ...seller, name: seller.name || shop.profile.name } : undefined}
        shopName={shop.profile.name}
        direct={owner === null}
      />
    </main>
  );
}
