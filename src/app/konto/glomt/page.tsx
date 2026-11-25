import type { Metadata } from "next";
import { CustomerForgotPage } from "@/features/customer-account/forgot-page";
import { customerPasswordResetAvailable } from "@/lib/customer-auth/forgot";
import { CART_RETURN_PARAM } from "@/lib/customer-auth/model";

export const metadata: Metadata = { title: "Glömt lösenordet", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** "Glömt lösenordet?" för kundens konto på namnskylt.com. Återförsäljarna har sin egen på /aterforsaljare/glomt. */
export default async function AccountForgotRoute({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const fromCart = (await searchParams)[CART_RETURN_PARAM] !== undefined;
  return (
    <main>
      <CustomerForgotPage shop={null} sellerName="namnskylt.com" available={customerPasswordResetAvailable()} fromCart={fromCart} />
    </main>
  );
}
