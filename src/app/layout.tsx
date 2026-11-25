import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { cookies, headers } from "next/headers";
import type { ReactNode } from "react";
import { editorialSerif } from "@/components/fonts";
import { PriceListProvider } from "@/components/price-list-provider";
import { SiteGate } from "@/components/site-gate";
import { SiteHeader } from "@/components/site-header";
import { CookieBanner } from "@/components/cookie-banner";
import { GoogleAnalytics } from "@/components/google-analytics";
import { SiteVisitBeacon } from "@/components/site-visit-beacon";
import { gaMeasurementId } from "@/lib/consent/ga";
import { endPriceTable } from "@/engine/price-model";
import { priceModelOrDefault } from "@/lib/orders/repository";
import { GATE_COOKIE, isValidGateCookie } from "@/lib/site-gate/token";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "namnskylt.com — namnskyltar i metall och plast",
    template: "%s · namnskylt.com",
  },
  description:
    "Skriv ditt namn och se din namnskylt i 3D direkt. Tillverkas i Sverige av Skylt & Gravyrteknik.",
};

export const viewport: Viewport = {
  themeColor: "#f4f2ec",
};

/** Kunder öppnar korrektur och offerter via en hemlig länk — den är deras behörighet, inte sajtkoden. */
const OPEN_PATHS = [
  "/korrektur/",
  "/offert/",
  "/order/",
  "/konto/losenord/",
  "/butik/",
  "/inbaddning/",
  "/aterforsaljare/",
  "/forhandsvisning/",
  "/integritet",
  "/villkor",
  "/for/",
];
/** Panelen och återförsäljarens inloggningssida har egen inloggning; de behåller sajtens meny. */
const SELF_AUTH_PATHS = ["/admin", "/aterforsaljare"];

export default async function RootLayout({ children }: { children: ReactNode }) {
  const pathname = (await headers()).get("x-pathname") ?? "";
  const open = OPEN_PATHS.some((prefix) => pathname.startsWith(prefix));
  const selfAuth = SELF_AUTH_PATHS.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  const unlocked = open || selfAuth || (await isValidGateCookie((await cookies()).get(GATE_COOKIE)?.value));
  const gaId = gaMeasurementId();
  return (
    <html lang="sv" className={`${GeistSans.variable} ${GeistMono.variable} ${editorialSerif.variable}`}>
      <body>
        <SiteGate unlocked={unlocked}>
          {!open && <SiteHeader />}
          {/* Bara slutkundens lista går till webbläsaren; inköpspriser och provision stannar på servern. */}
          <PriceListProvider priceList={endPriceTable(await priceModelOrDefault())}>{children}</PriceListProvider>
        </SiteGate>
        {/* Besöksstatistik utan kakor, och Google Analytics bara efter samtycke (beslut av ägaren 2026-11-25). */}
        <SiteVisitBeacon />
        {gaId ? (
          <>
            <GoogleAnalytics id={gaId} />
            <CookieBanner />
          </>
        ) : null}
      </body>
    </html>
  );
}
