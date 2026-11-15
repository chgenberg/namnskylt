import type { Metadata } from "next";
import { SiteFooter } from "@/components/site-footer";
import { TermsPage } from "@/features/terms/terms-page";
import { DEFAULT_COMPANY } from "@/lib/company/profile";
import { databaseConfigured, getCompanyProfile } from "@/lib/orders/repository";
import { paymentsConfigured } from "@/lib/payments/stripe";
import { OWNER_TENANT } from "@/lib/tenants/model";

export const metadata: Metadata = {
  title: "Köpvillkor",
  description: "Villkoren som gäller när du beställer namnskyltar på namnskylt.com.",
};

export default async function VillkorPage() {
  const seller = databaseConfigured() ? await getCompanyProfile(OWNER_TENANT) : DEFAULT_COMPANY;
  return (
    <main>
      <TermsPage seller={seller} cardPayments={paymentsConfigured()} />
      <SiteFooter />
    </main>
  );
}
