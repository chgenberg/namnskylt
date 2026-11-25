import type { Metadata } from "next";
import { SiteFooter } from "@/components/site-footer";
import { PrivacyPage } from "@/features/privacy/privacy-page";
import { gaMeasurementId } from "@/lib/consent/ga";

export const metadata: Metadata = {
  title: "Integritetspolicy",
  description: "Skylt & Gravyrteknik driver namnskylt.com och ansvarar för personuppgifterna när du beställer här.",
};

export default function IntegritetPage() {
  return (
    <main>
      <PrivacyPage analytics={gaMeasurementId() !== null} />
      <SiteFooter />
    </main>
  );
}
