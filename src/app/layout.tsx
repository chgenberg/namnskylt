import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
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
  themeColor: "#ffffff",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const unlocked = await isValidGateCookie((await cookies()).get(GATE_COOKIE)?.value);
  return (
    <html lang="sv" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>
        <SiteGate unlocked={unlocked}>
          <SiteHeader />
          {children}
        </SiteGate>
      </body>
    </html>
  );
}
