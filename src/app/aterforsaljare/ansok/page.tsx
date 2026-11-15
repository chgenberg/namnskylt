import type { Metadata } from "next";
import Link from "next/link";
import { ApplyForm } from "@/features/invite/apply-form";
import styles from "@/features/invite/invite.module.css";

export const metadata: Metadata = { title: "Skapa konto", robots: { index: false, follow: false } };

/** Skapa konto som återförsäljare. Kontot finns först när namnskylt.com har godkänt uppgifterna. */
export default function ApplyPage() {
  return (
    <main className={styles.page}>
      <div className={`${styles.card} ${styles.wide}`}>
        <header>
          <p className={styles.eyebrow}>Återförsäljare</p>
          <h1 className={styles.title}>Skapa konto</h1>
          <p className={styles.lead}>
            Konton är till för företag som säljer namnskyltar vidare till sina kunder, och kopplas till ett
            organisationsnummer. Med kontot designar ni skyltar åt era kunder, skickar offerter med ert eget namn och er
            logga och lägger ordrar till era inköpspriser. Vi går igenom uppgifterna innan kontot öppnas.
          </p>
          <p className={styles.lead}>
            Ska ni bara beställa skyltar till er själva? Då behövs inget konto: <Link href="/skapa">designa och beställ direkt</Link>.
          </p>
        </header>
        <ApplyForm />
        <p className={styles.foot}>
          Har ni redan ett konto? <Link href="/aterforsaljare">Logga in</Link>
        </p>
      </div>
    </main>
  );
}
