import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AccountPage } from "@/features/customer-account/account-page";
import { getShop } from "@/lib/shops/repository";

export const metadata: Metadata = { title: "Mitt konto" };

/** Slutkundens sida i butiken: ordrarna som lagts där med kontot, och uppgifterna kassan fylls i med. */
export default async function ShopAccountRoute({ params }: { params: Promise<{ slug: string }> }) {
  const shop = await getShop((await params).slug);
  if (!shop) notFound();
  return (
    <main>
      <AccountPage shop={shop.slug} sellerName={shop.profile.name} />
    </main>
  );
}
