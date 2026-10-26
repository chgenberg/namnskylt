import { SmartInput } from "@/features/home/smart-input";
import styles from "./page.module.css";

export default function HomePage() {
  return (
    <main className={styles.main}>
      <div className={styles.glow} aria-hidden="true" />
      <section className={`container ${styles.hero}`}>
        <p className="eyebrow">Graverade namnskyltar · Tillverkade i Sverige</p>
        <h1 className={styles.title}>
          Skriv ditt namn.
          <span className={styles.titleMuted}>Vi graverar resten.</span>
        </h1>
        <SmartInput />
      </section>
      <footer className={styles.footer}>
        Tillverkas av Skylt &amp; Gravyrteknik · Leverans inom 5 arbetsdagar
      </footer>
    </main>
  );
}
