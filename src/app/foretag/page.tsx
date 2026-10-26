import type { Metadata } from "next";
import { SiteFooter } from "@/components/site-footer";
import { BusinessPage } from "@/features/business/business-page";

export const metadata: Metadata = {
  title: "För företag",
  description:
    "Graverade namnskyltar till hela teamet. Formge en skylt, klistra in listan med namn och få mängdrabatt på hela beställningen.",
};

export default function ForetagPage() {
  return (
    <main>
      <BusinessPage />
      <SiteFooter />
    </main>
  );
}
