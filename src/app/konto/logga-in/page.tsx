import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccountEntry } from "@/features/customer-account/account-entry";
import { accountPaths } from "@/lib/customer-auth/model";
import { currentCustomer } from "@/lib/customer-auth/session";

export const metadata: Metadata = { title: "Logga in", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Slutkundens inloggning på namnskylt.com. Återförsäljarna har sin egen på /aterforsaljare. */
export default async function AccountLoginRoute() {
  if (await currentCustomer(null)) redirect(accountPaths(null).home);
  return (
    <main>
      <AccountEntry shop={null} sellerName="namnskylt.com" />
    </main>
  );
}
