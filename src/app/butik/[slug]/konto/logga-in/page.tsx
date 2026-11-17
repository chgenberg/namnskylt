import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AccountEntry } from "@/features/customer-account/account-entry";
import { accountPaths } from "@/lib/customer-auth/model";
import { currentCustomer } from "@/lib/customer-auth/session";
import { getShop } from "@/lib/shops/repository";

export const metadata: Metadata = { title: "Logga in" };

/** Slutkundens inloggning i butiken. Kontot gäller bara här. */
export default async function ShopAccountLoginRoute({ params }: { params: Promise<{ slug: string }> }) {
  const shop = await getShop((await params).slug);
  if (!shop) notFound();
  if (await currentCustomer(shop.slug)) redirect(accountPaths(shop.slug).home);
  return (
    <main>
      <AccountEntry shop={shop.slug} sellerName={shop.profile.name} />
    </main>
  );
}
