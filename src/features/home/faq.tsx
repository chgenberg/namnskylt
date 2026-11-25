import type { FaqItem } from "@/lib/seo/site-facts";
import styles from "./faq.module.css";

/**
 * Vanliga frågor på startsidan (2026-11-25). Samma frågor och svar står som FAQPage i sidans JSON-LD, och de är
 * det sökmotorer och AI-tjänster helst citerar. Svaren räknas ur prismodellen där de nämner pris och frakt.
 */
export function HomeFaq({ items }: { items: readonly FaqItem[] }) {
  return (
    <section className={styles.faq} aria-labelledby="vanliga-fragor">
      <div className="container">
        <h2 id="vanliga-fragor" className={styles.title}>
          Vanliga frågor om namnskyltar
        </h2>
        <div className={styles.list}>
          {items.map((item) => (
            <details key={item.question} className={styles.item}>
              <summary className={styles.question}>{item.question}</summary>
              <p className={styles.answer}>{item.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
