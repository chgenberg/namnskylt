import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { cookies, headers } from "next/headers";
import type { ReactNode } from "react";
import { editorialSerif } from "@/components/fonts";
import { SiteGate } from "@/components/site-gate";
import { SiteHeader } from "@/components/site-header";
import { GATE_COOKIE, isValidGateCookie } from "@/lib/site-gate/token";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "namnskylt.com — graverade namnskyltar",
    template: "%s · namnskylt.com",
  },
  description:
    "Skriv ditt namn och se din graverade namnskylt i 3D direkt. Tillverkas i Sverige av Skylt & Gravyrteknik.",
};

export const viewport: Viewport = {
  themeColor: "#f4f2ec",
};

/** Kunder öppnar korrektur och offerter via en hemlig länk — den är deras behörighet, inte sajtkoden. */
const OPEN_PATHS = ["/korrektur/", "/offert/", "/butik/", "/inbaddning/"];

export default async function RootLayout({ children }: { children: ReactNode }) {
  const pathname = (await headers()).get("x-pathname") ?? "";
  const open = OPEN_PATHS.some((prefix) => pathname.startsWith(prefix));
  const unlocked = open || (await isValidGateCookie((await cookies()).get(GATE_COOKIE)?.value));
  return (
    <html lang="sv" className={`${GeistSans.variable} ${GeistMono.variable} ${editorialSerif.variable}`}>
      <body>
        <SiteGate unlocked={unlocked}>
          {!open && <SiteHeader />}
          {children}
        </SiteGate>
      </body>
    </html>
  );
}
