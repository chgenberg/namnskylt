import type { ReactNode } from "react";
import styles from "./panel-section.module.css";

interface PanelSectionProps {
  step: number;
  title: string;
  aside?: ReactNode;
  children: ReactNode;
}

export function PanelSection({ step, title, aside, children }: PanelSectionProps) {
  const headingId = `section-${step}`;
  return (
    <section className={styles.section} aria-labelledby={headingId}>
      <header className={styles.header}>
        <h2 id={headingId} className={styles.title}>
          <span className={`mono ${styles.step}`}>{String(step).padStart(2, "0")}</span>
          {title}
        </h2>
        {aside && <div className={styles.aside}>{aside}</div>}
      </header>
      <div className={styles.body}>{children}</div>
    </section>
  );
}
