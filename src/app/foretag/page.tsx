import type { Metadata } from "next";
import { SiteFooter } from "@/components/site-footer";
import { endPriceTable } from "@/engine";
import { BusinessPage } from "@/features/business/business-page";
import { getPriceModel } from "@/lib/orders/repository";

export const metadata: Metadata = {
  title: "För företag",
  description:
    "Graverade namnskyltar till hela teamet. Formge en skylt, klistra in listan med namn och få lägre pris per skylt när ni beställer fler.",
};

export default async function ForetagPage() {
  return (
    <main>
      <BusinessPage priceList={endPriceTable(await getPriceModel())} />
      <SiteFooter />
    </main>
  );
}
