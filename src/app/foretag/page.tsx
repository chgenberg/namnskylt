import { JsonLd } from "@/components/json-ld";
import { pageMetadata, SITE_PAGES } from "@/lib/seo/page";
import { siteFacts } from "@/lib/seo/facts";
import { pageGraph, products } from "@/lib/seo/structured-data";
import { SiteFooter } from "@/components/site-footer";
import { endPriceTable } from "@/engine/price-model";
import { BusinessPage } from "@/features/business/business-page";
import { getPriceModel } from "@/lib/orders/repository";

const PAGE = SITE_PAGES.foretag;

export const metadata = pageMetadata(PAGE);

export default async function ForetagPage() {
  return (
    <main>
      <JsonLd data={pageGraph(PAGE, { parts: products(await siteFacts()) })} />
      <BusinessPage priceList={endPriceTable(await getPriceModel())} />
      <SiteFooter />
    </main>
  );
}
