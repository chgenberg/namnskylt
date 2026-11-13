import type { Metadata } from "next";
import { SiteFooter } from "@/components/site-footer";
import { PrivacyPage } from "@/features/privacy/privacy-page";

export const metadata: Metadata = {
  title: "Så hanterar vi uppgifter",
  description: "Hur namnskylt.com hanterar uppgifter i utskicken till återförsäljare.",
};

export default function IntegritetPage() {
  return (
    <main>
      <PrivacyPage />
      <SiteFooter />
    </main>
  );
}
