import type { Metadata } from "next";
import { SiteFooter } from "@/components/site-footer";
import { DemoPage } from "@/features/demo/demo-page";
import { DEMO_FILM } from "@/lib/callback/film";

export const metadata: Metadata = {
  title: "Bli återförsäljare",
  description: "Gör namnskyltar och offerter åt era kunder, med er logga och era priser. Skylt & Gravyrteknik tillverkar och skickar.",
  // Länken från utskicksmejlet bär mottagarens kod, så sidan ska varken hamna i sökmotorer eller skicka vidare adressen.
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export const dynamic = "force-dynamic";

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function DemoRoute({ searchParams }: { searchParams: Promise<{ k?: string | string[] }> }) {
  const token = first((await searchParams).k)?.slice(0, 200) || null;
  return (
    <main data-floating-header>
      <DemoPage token={token} film={DEMO_FILM} />
      <SiteFooter />
    </main>
  );
}
