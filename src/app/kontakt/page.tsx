import type { Metadata } from "next";
import { SiteFooter } from "@/components/site-footer";
import { ContactPage } from "@/features/about/contact-page";

export const metadata: Metadata = {
  title: "Kontakta oss",
  description: "Ring eller mejla Skylt & Gravyrteknik, som driver namnskylt.com: telefon, e-post, adress och öppettider i Högsbo, Göteborg.",
};

export default function KontaktPage() {
  return (
    <main data-floating-header>
      <ContactPage />
      <SiteFooter />
    </main>
  );
}
