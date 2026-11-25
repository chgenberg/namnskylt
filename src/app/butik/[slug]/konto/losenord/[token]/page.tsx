import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PasswordLinkPage } from "@/features/customer-account/password-link-page";
import { CART_RETURN_PARAM } from "@/lib/customer-auth/model";
import { getShop } from "@/lib/shops/repository";

export const metadata: Metadata = { title: "Välj nytt lösenord" };

/** Länken där butikens kund väljer nytt lösenord. Koden i länken är behörigheten. */
export default async function ShopAccountPasswordRoute({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug, token } = await params;
  const fromCart = (await searchParams)[CART_RETURN_PARAM] !== undefined;
  const shop = await getShop(slug);
  if (!shop) notFound();
  return (
    <main>
      <PasswordLinkPage shop={shop.slug} sellerName={shop.profile.name} token={token} fromCart={fromCart} />
    </main>
  );
}
