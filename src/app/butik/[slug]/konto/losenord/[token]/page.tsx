import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PasswordLinkPage } from "@/features/customer-account/password-link-page";
import { getShop } from "@/lib/shops/repository";

export const metadata: Metadata = { title: "Välj nytt lösenord" };

/** Länken där butikens kund väljer nytt lösenord. Koden i länken är behörigheten. */
export default async function ShopAccountPasswordRoute({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  const shop = await getShop(slug);
  if (!shop) notFound();
  return (
    <main>
      <PasswordLinkPage shop={shop.slug} sellerName={shop.profile.name} token={token} />
    </main>
  );
}
