import Link from "next/link";
import { TOPIC_HUB, TOPICS } from "@/lib/topics/model";
import { TopicCards } from "./topic-page";
import styles from "./topics.module.css";

/** Översikten över sidorna om namnskyltar: efter skylt och efter bransch. */
export function TopicsHub() {
  const signs = TOPICS.filter((topic) => topic.kind === "skylt");
  const industries = TOPICS.filter((topic) => topic.kind === "bransch");
  return (
    <article className={styles.page}>
      <nav className={styles.crumbs} aria-label="Brödsmulor">
        <Link href="/">Start</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">Namnskyltar</span>
      </nav>
      <header className={styles.hubHead}>
        <p className={styles.eyebrow}>Namnskyltar</p>
        <h1 className={styles.title}>{TOPIC_HUB.title}</h1>
        <p className={styles.lead}>
          Namnskyltar till företag, i metall och plast, med namn, titel och logga. Välj efter skylt eller efter
          bransch, eller börja direkt i skyltmotorn.
        </p>
        <div className={styles.actions}>
          <Link href="/skapa?t=" className="btn btn--primary btn--lg">
            Skapa namnskylt
          </Link>
          <Link href="/inspiration" className="btn btn--ghost btn--lg">
            Se exempel
          </Link>
        </div>
      </header>
      <section className={styles.group} aria-labelledby="efter-skylt">
        <h2 id="efter-skylt" className={styles.relatedTitle}>
          Efter skylt
        </h2>
        <TopicCards topics={signs} />
      </section>
      <section className={styles.group} aria-labelledby="efter-bransch">
        <h2 id="efter-bransch" className={styles.relatedTitle}>
          Efter bransch
        </h2>
        <TopicCards topics={industries} />
      </section>
    </article>
  );
}
