import Link from "next/link";
import { HOW_IT_WORKS } from "./how-it-works-copy";
import { HowItWorksFlowImage } from "./how-it-works-flows";
import styles from "./how-it-works.module.css";

function stepId(index: number): string {
  return `steg-${index + 1}`;
}

function stepNumber(index: number): string {
  return String(index + 1).padStart(2, "0");
}

export function HowItWorks() {
  const t = HOW_IT_WORKS;
  return (
    <section id="sa-funkar-det" className={styles.section} aria-labelledby="sa-funkar-det-titel">
      <div className={`container ${styles.intro}`}>
        <p className="eyebrow">{t.eyebrow}</p>
        <h2 id="sa-funkar-det-titel" className={styles.title}>
          {t.title}
        </h2>
        <p className={styles.body}>{t.body}</p>

        <nav aria-label={t.stripLabel} className={styles.strip}>
          <ol>
            {t.steps.map((step, i) => (
              <li key={step.flow}>
                <a href={`#${stepId(i)}`} className={styles.stripLink}>
                  <span className={`mono ${styles.stripNumber}`}>{i + 1}</span>
                  <span>{step.short}</span>
                </a>
              </li>
            ))}
          </ol>
        </nav>
      </div>

      <div className={`container ${styles.steps}`}>
        {t.steps.map((step, i) => (
          <article
            key={step.flow}
            id={stepId(i)}
            className={styles.step}
            data-flip={i % 2 === 1}
            aria-labelledby={`${stepId(i)}-titel`}
          >
            <div className={styles.copy}>
              <p className={styles.number} aria-hidden="true">
                {stepNumber(i)}
              </p>
              <h3 id={`${stepId(i)}-titel`} className={styles.stepTitle}>
                {step.title}
              </h3>
              <p className={styles.lead}>{step.lead}</p>
              <div className={styles.paragraphs}>
                {step.body.map((paragraph) => (
                  <p key={paragraph.slice(0, 32)}>{paragraph}</p>
                ))}
              </div>
              {"options" in step && (
                <dl className={styles.options}>
                  {step.options.map((option) => (
                    <div key={option.title}>
                      <dt>{option.title}</dt>
                      <dd>{option.body}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {"cta" in step && (
                <Link href={step.cta.href} className={styles.cta}>
                  {step.cta.label}
                  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
                    <path d="M3 8h10M9 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </Link>
              )}
            </div>
            <HowItWorksFlowImage flow={step.flow} label={`${step.title}: ${step.lead}`} />
          </article>
        ))}
      </div>

      <div className={`container ${styles.outro}`}>
        <h2 className={styles.outroTitle}>Redo att skriva ditt namn?</h2>
        <Link href="#borja" className="btn btn--primary btn--lg">
          Skriv ditt namn
        </Link>
      </div>
    </section>
  );
}
