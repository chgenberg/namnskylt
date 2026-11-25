import Link from "next/link";
import styles from "./reseller-invite.module.css";

/**
 * Vägen in för den som vill bli återförsäljare, sist på startsidan (besked av ägaren 2026-11-25:
 * "Startsidan saknar en länk för den som vill bli återförsäljare … Fixa"). Förut gick vägen bara via
 * Logga in. Bara på namnskylt.com: butikernas startsida har inget sådant avsnitt.
 */
export function ResellerInvite() {
  return (
    <section className={styles.invite} aria-labelledby="aterforsaljare-rubrik">
      <div className="container">
        <div className={styles.inner}>
          <div className={styles.text}>
            <p className={styles.eyebrow}>För återförsäljare</p>
            <h2 id="aterforsaljare-rubrik" className={styles.title}>
              Sälj namnskyltar i ert eget namn
            </h2>
            <p className={styles.lead}>
              Gör offerter med er logga och sätt era egna priser. Skylt &amp; Gravyrteknik
              tillverkar och skickar.
            </p>
          </div>
          <div className={styles.actions}>
            <Link href="/aterforsaljare/ansok" className="btn btn--primary btn--lg">
              Bli återförsäljare
            </Link>
            <Link href="/aterforsaljare" className={styles.login}>
              Redan återförsäljare? Logga in
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
