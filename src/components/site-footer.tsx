import Link from "next/link";
import { CookieSettingsButton } from "@/components/cookie-banner";
import { gaMeasurementId } from "@/lib/consent/ga";
import styles from "./site-footer.module.css";

/**
 * Sidfoten. namnskylt.com är Skylt & Gravyrtekniks sajt för namnskyltar och inget eget bolag
 * (besked av ägaren 2026-11-18), så foten säger vem som driver sajten och länkar till dem.
 */
export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <p>namnskylt.com drivs av Skylt &amp; Gravyrteknik · Leverans inom 5 arbetsdagar</p>
      {/* Länkarna står på en egen rad, så att var och en går att träffa med fingret på en telefon. */}
      <nav className={styles.links} aria-label="Om sajten">
        <Link href="/namnskyltar">Alla namnskyltar</Link>
        <Link href="/om-oss">Om oss</Link>
        <Link href="/kontakt">Kontakta oss</Link>
        <Link href="/aterforsaljare/ansok">Bli återförsäljare</Link>
        <Link href="/villkor">Köpvillkor</Link>
        <Link href="/integritet">Integritet</Link>
        {gaMeasurementId() ? <CookieSettingsButton className={styles.linkButton} /> : null}
      </nav>
    </footer>
  );
}
