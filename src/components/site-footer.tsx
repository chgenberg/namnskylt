import Link from "next/link";
import styles from "./site-footer.module.css";

/**
 * Sidfoten. namnskylt.com är Skylt & Gravyrtekniks sajt för namnskyltar och inget eget bolag
 * (besked av ägaren 2026-11-18), så foten säger vem som driver sajten och länkar till dem.
 */
export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      namnskylt.com drivs av Skylt &amp; Gravyrteknik · Leverans inom 5 arbetsdagar · <Link href="/om-oss">Om oss</Link> ·{" "}
      <Link href="/kontakt">Kontakta oss</Link> · <Link href="/villkor">Köpvillkor</Link> · <Link href="/integritet">Integritet</Link>
    </footer>
  );
}
