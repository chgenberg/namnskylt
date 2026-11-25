import { JsonLd } from "@/components/json-ld";
import { pageMetadata, SITE_PAGES } from "@/lib/seo/page";
import { pageGraph, WORKSHOP_ID, workshopOrganization } from "@/lib/seo/structured-data";
import { SiteFooter } from "@/components/site-footer";
import { AboutPage } from "@/features/about/about-page";

const PAGE = SITE_PAGES.omOss;

export const metadata = pageMetadata(PAGE);

export default function OmOssPage() {
  return (
    <main data-floating-header>
      <JsonLd data={pageGraph(PAGE, { type: "AboutPage", about: WORKSHOP_ID, parts: [workshopOrganization()] })} />
      <AboutPage />
      <SiteFooter />
    </main>
  );
}
