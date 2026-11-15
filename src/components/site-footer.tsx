import Link from "next/link";
import styles from "./site-footer.module.css";

export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      Tillverkas av Skylt &amp; Gravyrteknik · Leverans inom 5 arbetsdagar · <Link href="/villkor">Köpvillkor</Link> ·{" "}
      <Link href="/integritet">Integritet</Link>
    </footer>
  );
}
