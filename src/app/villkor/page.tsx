import { JsonLd } from "@/components/json-ld";
import { pageMetadata, SITE_PAGES } from "@/lib/seo/page";
import { pageGraph } from "@/lib/seo/structured-data";
import { SiteFooter } from "@/components/site-footer";
import { TermsPage } from "@/features/terms/terms-page";
import { paymentsConfigured } from "@/lib/payments/stripe";

const PAGE = SITE_PAGES.villkor;

export const metadata = pageMetadata(PAGE);

export default function VillkorPage() {
  return (
    <main>
      <JsonLd data={pageGraph(PAGE)} />
      <TermsPage cardPayments={paymentsConfigured()} />
      <SiteFooter />
    </main>
  );
}
