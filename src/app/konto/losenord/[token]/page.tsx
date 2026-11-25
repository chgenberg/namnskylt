import type { Metadata } from "next";
import { PasswordLinkPage } from "@/features/customer-account/password-link-page";
import { CART_RETURN_PARAM } from "@/lib/customer-auth/model";

export const metadata: Metadata = { title: "Välj nytt lösenord", robots: { index: false, follow: false, nocache: true } };
export const dynamic = "force-dynamic";

/** Länken där en kund på namnskylt.com väljer nytt lösenord. Koden i länken är behörigheten. */
export default async function AccountPasswordRoute({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const fromCart = (await searchParams)[CART_RETURN_PARAM] !== undefined;
  return (
    <main>
      <PasswordLinkPage shop={null} sellerName="namnskylt.com" token={(await params).token} fromCart={fromCart} />
    </main>
  );
}
