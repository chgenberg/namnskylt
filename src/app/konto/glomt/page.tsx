import type { Metadata } from "next";
import { CustomerForgotPage } from "@/features/customer-account/forgot-page";
import { customerPasswordResetAvailable } from "@/lib/customer-auth/forgot";

export const metadata: Metadata = { title: "Glömt lösenordet", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** "Glömt lösenordet?" för kundens konto på namnskylt.com. Återförsäljarna har sin egen på /aterforsaljare/glomt. */
export default function AccountForgotRoute() {
  return (
    <main>
      <CustomerForgotPage shop={null} sellerName="namnskylt.com" available={customerPasswordResetAvailable()} />
    </main>
  );
}
