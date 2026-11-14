import type { Metadata } from "next";
import Link from "next/link";
import { ApplyForm } from "@/features/invite/apply-form";
import styles from "@/features/invite/invite.module.css";

export const metadata: Metadata = { title: "Bli återförsäljare", robots: { index: false, follow: false } };

/** Ansökan om att bli återförsäljare. Kontot finns först när namnskylt.com har godkänt den. */
export default function ApplyPage() {
  return (
    <main className={styles.page}>
      <div className={`${styles.card} ${styles.wide}`}>
        <header>
          <p className={styles.eyebrow}>namnskylt.com</p>
          <h1 className={styles.title}>Bli återförsäljare</h1>
          <p className={styles.lead}>
            Designa namnskyltar åt era kunder i skyltmotorn, skicka offerter med ert eget namn och er logga, och lägg ordrar
            till era inköpspriser. Fyll i företagets uppgifter, så hör vi av oss.
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
