import { JsonLd } from "@/components/json-ld";
import { pageMetadata, SITE_PAGES } from "@/lib/seo/page";
import { pageGraph } from "@/lib/seo/structured-data";
import { SiteFooter } from "@/components/site-footer";
import { PrivacyPage } from "@/features/privacy/privacy-page";
import { gaMeasurementId } from "@/lib/consent/ga";

const PAGE = SITE_PAGES.integritet;

export const metadata = pageMetadata(PAGE);

export default function IntegritetPage() {
  return (
    <main>
      <JsonLd data={pageGraph(PAGE)} />
      <PrivacyPage analytics={gaMeasurementId() !== null} />
      <SiteFooter />
    </main>
  );
}
