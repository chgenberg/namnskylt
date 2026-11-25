"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { analyticsAllowedOn, CONSENT_CHANGED_EVENT } from "@/lib/consent/model";
import { readConsent } from "./consent-client";

/** Tar bort Google Analytics kakor när någon drar tillbaka sitt samtycke. */
function clearGaCookies(id: string) {
  (window as unknown as Record<string, boolean>)[`ga-disable-${id}`] = true;
  for (const name of document.cookie.split(";").map((part) => part.split("=")[0]?.trim() ?? "")) {
    if (!name.startsWith("_ga")) continue;
    for (const domain of ["", `; Domain=${window.location.hostname}`, "; Domain=.namnskylt.com"]) {
      document.cookie = `${name}=; Max-Age=0; Path=/${domain}`;
    }
  }
}

/**
 * Google Analytics, bara när besökaren har godkänt alla kakor (beslut av ägaren 2026-11-25) och bara på
 * namnskylt.coms egna sidor. Utan samtycke laddas inget från Google.
 */
export function GoogleAnalytics({ id }: { id: string }) {
  const pathname = usePathname() ?? "/";
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    const sync = () => {
      const ok = readConsent() === "alla";
      if (!ok) clearGaCookies(id);
      else (window as unknown as Record<string, boolean>)[`ga-disable-${id}`] = false;
      setAllowed(ok);
    };
    sync();
    window.addEventListener(CONSENT_CHANGED_EVENT, sync);
    return () => window.removeEventListener(CONSENT_CHANGED_EVENT, sync);
  }, [id]);
  if (!allowed || typeof window === "undefined" || !analyticsAllowedOn(window.location.hostname, pathname)) return null;
  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${id}`} strategy="afterInteractive" />
      <Script id="ga-config" strategy="afterInteractive">
        {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${id}');`}
      </Script>
    </>
  );
}
