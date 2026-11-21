import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import styles from "./not-found.module.css";

export const metadata: Metadata = { title: "Sidan finns inte", robots: { index: false, follow: false } };

/** Sajtens egen sida för en adress som inte finns, i stället för webbramverkets engelska "404". */
export default function NotFound() {
  return (
    <main data-floating-header>
      <div className={`container ${styles.page}`}>
        <p className="eyebrow">Fel adress</p>
        <h1 className={styles.title}>Sidan finns inte</h1>
        <p className={styles.lead}>Länken kan vara gammal, eller så har sidan flyttat.</p>
        <Link href="/" className="btn btn--primary">
          Till startsidan
        </Link>
      </div>
      <SiteFooter />
    </main>
  );
}
