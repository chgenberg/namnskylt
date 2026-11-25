import Link from "next/link";
import { TOPIC_HUB, TOPICS, topicPath, type TopicKind } from "@/lib/topics/model";
import styles from "./topic-links.module.css";

const GROUPS: { kind: TopicKind; title: string }[] = [
  { kind: "skylt", title: "Efter skylt" },
  { kind: "bransch", title: "Efter bransch" },
];

/** Startsidans länkar till sidorna om namnskyltar, så att sökmotorerna hittar dem och besökaren rätt sida. */
export function TopicLinks() {
  return (
    <section className={styles.links} aria-labelledby="hitta-ratt">
      <div className="container">
        <h2 id="hitta-ratt" className={styles.title}>
          Hitta rätt namnskylt
        </h2>
        <div className={styles.groups}>
          {GROUPS.map((group) => (
            <nav key={group.kind} aria-label={group.title}>
              <h3 className={styles.group}>{group.title}</h3>
              <ul>
                {TOPICS.filter((topic) => topic.kind === group.kind).map((topic) => (
                  <li key={topic.slug}>
                    <Link href={topicPath(topic)}>{topic.title}</Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <p className={styles.all}>
          <Link href={TOPIC_HUB.path}>Alla namnskyltar och namnbrickor</Link>
        </p>
      </div>
    </section>
  );
}
