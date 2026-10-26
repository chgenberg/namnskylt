import { HowItWorks } from "@/features/home/how-it-works";
import { INPUT_ANCHOR, SmartInput } from "@/features/home/smart-input";
import styles from "./page.module.css";

export default function HomePage() {
  return (
    <main>
      <div className={styles.main}>
        <div className={styles.glow} aria-hidden="true" />
        <section id={INPUT_ANCHOR} className={`container ${styles.hero}`}>
          <p className="eyebrow">Graverade namnskyltar · Tillverkade i Sverige</p>
          <h1 className={styles.title}>
            Skriv ditt namn.
            <span className={styles.titleMuted}>Vi graverar resten.</span>
          </h1>
          <SmartInput />
        </section>
        <a href="#sa-funkar-det" className={styles.scrollHint}>
          Så funkar det
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path d="M8 3v10M4 9l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </a>
      </div>
      <HowItWorks />
      <footer className={styles.footer}>
        Tillverkas av Skylt &amp; Gravyrteknik · Leverans inom 5 arbetsdagar
      </footer>
    </main>
  );
}
