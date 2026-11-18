import type { Metadata } from "next";
import { SiteFooter } from "@/components/site-footer";
import { TermsPage } from "@/features/terms/terms-page";
import { paymentsConfigured } from "@/lib/payments/stripe";

export const metadata: Metadata = {
  title: "Köpvillkor",
  description: "Skylt & Gravyrtekniks köpvillkor, som gäller när du beställer namnskyltar på namnskylt.com.",
};

export default function VillkorPage() {
  return (
    <main>
      <TermsPage cardPayments={paymentsConfigured()} />
      <SiteFooter />
    </main>
  );
}
