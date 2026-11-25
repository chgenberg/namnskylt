import { JsonLd } from "@/components/json-ld";
import { pageMetadata, SITE_PAGES } from "@/lib/seo/page";
import { pageGraph, WORKSHOP_ID, workshopOrganization } from "@/lib/seo/structured-data";
import { SiteFooter } from "@/components/site-footer";
import { ContactPage } from "@/features/about/contact-page";

const PAGE = SITE_PAGES.kontakt;

export const metadata = pageMetadata(PAGE);

export default function KontaktPage() {
  return (
    <main data-floating-header>
      <JsonLd data={pageGraph(PAGE, { type: "ContactPage", about: WORKSHOP_ID, parts: [workshopOrganization()] })} />
      <ContactPage />
      <SiteFooter />
    </main>
  );
}
