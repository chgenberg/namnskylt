import type { FaqItem } from "@/lib/seo/site-facts";
import styles from "./faq.module.css";

/**
 * Vanliga frågor, på startsidan och sidorna om namnskyltar (2026-11-25). Samma frågor och svar står som FAQPage
 * i sidans JSON-LD, och de är det sökmotorer och AI-tjänster helst citerar. Svaren räknas ur prismodellen där
 * de nämner pris och frakt. `bare` utelämnar sidans egen marginal och container, när avsnittet står i en
 * sida som redan har dem.
 */
export function Faq({
  items,
  title = "Vanliga frågor om namnskyltar",
  bare = false,
}: {
  items: readonly FaqItem[];
  title?: string;
  bare?: boolean;
}) {
  const content = (
    <>
      <h2 id="vanliga-fragor" className={styles.title}>
        {title}
      </h2>
      <div className={styles.list}>
        {items.map((item) => (
          <details key={item.question} className={styles.item}>
            <summary className={styles.question}>{item.question}</summary>
            <p className={styles.answer}>{item.answer}</p>
          </details>
        ))}
      </div>
    </>
  );
  if (bare) {
    return (
      <section className={styles.bare} aria-labelledby="vanliga-fragor">
        {content}
      </section>
    );
  }
  return (
    <section className={styles.faq} aria-labelledby="vanliga-fragor">
      <div className="container">{content}</div>
    </section>
  );
}
