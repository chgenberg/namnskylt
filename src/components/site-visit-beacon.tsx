"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/** Bara namnskylt.coms egna sidor räknas; en återförsäljares butik på egen domän gör det inte. */
const OWN_HOST = /(^|\.)namnskylt\.com$|^localhost$|^127\.0\.0\.1$/;

/**
 * Räknar sidvisningen utan kakor (beslut av ägaren 2026-11-25): adressen, kampanjen i adressen och sidan
 * besökaren kom ifrån. Inget sparas i webbläsaren. Servern avgör vad som räknas.
 */
export function SiteVisitBeacon() {
  const pathname = usePathname();
  const first = useRef(true);
  useEffect(() => {
    if (!pathname || !OWN_HOST.test(window.location.hostname)) return;
    if (pathname.startsWith("/admin") || pathname.startsWith("/butik")) return;
    const body = JSON.stringify({
      path: pathname,
      search: window.location.search.slice(0, 400),
      referrer: first.current ? document.referrer.slice(0, 400) : "",
    });
    first.current = false;
    const blob = new Blob([body], { type: "text/plain;charset=UTF-8" });
    if (!navigator.sendBeacon?.("/api/site-visits", blob)) {
      void fetch("/api/site-visits", { method: "POST", body, keepalive: true }).catch(() => undefined);
    }
  }, [pathname]);
  return null;
}
