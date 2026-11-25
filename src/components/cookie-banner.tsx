"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { analyticsAllowedOn, CONSENT_OPEN_EVENT, type Consent } from "@/lib/consent/model";
import { readConsent, saveConsent } from "./consent-client";
import styles from "./cookie-banner.module.css";

/**
 * Rutan om kakor (beslut av ägaren 2026-11-25), som hos Skylt & Gravyrteknik. Den visas bara när Google
 * Analytics är påslaget, på namnskylt.coms egna sidor, tills besökaren har valt. Valet går att ändra med
 * "Cookieinställningar" i sidfoten. Båda knapparna är lika tydliga, så att det är lika lätt att säga nej.
 */
export function CookieBanner() {
  const pathname = usePathname() ?? "/";
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (analyticsAllowedOn(window.location.hostname, pathname) && readConsent() === null) setOpen(true);
    const reopen = () => setOpen(true);
    window.addEventListener(CONSENT_OPEN_EVENT, reopen);
    return () => window.removeEventListener(CONSENT_OPEN_EVENT, reopen);
  }, [pathname]);
  if (!open) return null;
  const choose = (consent: Consent) => {
    saveConsent(consent);
    setOpen(false);
  };
  return (
    <section className={styles.banner} role="dialog" aria-modal="false" aria-labelledby="kakor-rubrik">
      <div className={styles.text}>
        <h2 id="kakor-rubrik" className={styles.title}>
          Kakor på namnskylt.com
        </h2>
        <p>
          Nödvändiga kakor behövs för att sajten ska fungera. Godkänner du alla använder vi också Google Analytics för att
          se hur sajten används. <Link href="/integritet">Läs mer</Link>
        </p>
      </div>
      <div className={styles.actions}>
        <button type="button" className="btn btn--ghost" onClick={() => choose("nodvandiga")}>
          Bara nödvändiga
        </button>
        <button type="button" className="btn btn--primary" onClick={() => choose("alla")}>
          Godkänn alla
        </button>
      </div>
    </section>
  );
}

/** Länken i sidfoten som öppnar rutan igen. */
export function CookieSettingsButton({ className }: { className?: string }) {
  return (
    <button type="button" className={className} onClick={() => window.dispatchEvent(new Event(CONSENT_OPEN_EVENT))}>
      Cookieinställningar
    </button>
  );
}
