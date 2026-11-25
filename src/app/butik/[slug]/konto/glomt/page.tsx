import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CustomerForgotPage } from "@/features/customer-account/forgot-page";
import { customerPasswordResetAvailable } from "@/lib/customer-auth/forgot";
import { CART_RETURN_PARAM } from "@/lib/customer-auth/model";
import { getShop } from "@/lib/shops/repository";

export const metadata: Metadata = { title: "Glömt lösenordet", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** "Glömt lösenordet?" för kundens konto i butiken. Kontot och mejlet hör till butiken. */
export default async function ShopAccountForgotRoute({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const shop = await getShop((await params).slug);
  if (!shop) notFound();
  const fromCart = (await searchParams)[CART_RETURN_PARAM] !== undefined;
  return (
    <main>
      <CustomerForgotPage shop={shop.slug} sellerName={shop.profile.name} available={customerPasswordResetAvailable()} fromCart={fromCart} />
    </main>
  );
}
