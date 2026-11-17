import type { Metadata } from "next";
import { AccountPage } from "@/features/customer-account/account-page";

export const metadata: Metadata = { title: "Mitt konto", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Slutkundens sida på namnskylt.com: ordrar, "Beställ igen" och uppgifterna kassan fylls i med. */
export default function AccountRoute() {
  return (
    <main>
      <AccountPage shop={null} sellerName="namnskylt.com" />
    </main>
  );
}
