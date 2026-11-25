import Link from "next/link";
import { Faq } from "@/components/faq";
import { kr, type SiteFacts } from "@/lib/seo/site-facts";
import { TOPIC_HUB, topicPath, type Topic } from "@/lib/topics/model";
import styles from "./topics.module.css";

/** Exempelskyltens bild, ritad av motorn: 1056 × 528 px på papper med skugga. */
export const TOPIC_IMAGE = { width: 1056, height: 528 } as const;
export const topicImagePath = (topic: Pick<Topic, "slug">) => `${topicPath(topic)}/skylt.png`;

/** Priset per skylt för sidans material, ur prismodellen: en enstaka skylt och 500, med nål, exkl. moms. */
export function TopicPrices({ topic, facts }: { topic: Topic; facts: SiteFacts }) {
  const rows = topic.materials
    .map((id) => facts.materials.find((material) => material.id === id))
    .filter((material) => material !== undefined);
  return (
    <dl className={styles.prices} aria-label="Pris per skylt">
      {rows.map((material) => (
        <div key={material.id}>
          <dt>{material.name}</dt>
          <dd>
            {kr(material.oneSek)} för en skylt, från {kr(material.manySek)} styck vid 500
          </dd>
        </div>
      ))}
      <p>Med nål, exkl. moms. Priset sjunker med antalet.</p>
    </dl>
  );
}

/** Länkar till sidorna om namnskyltar, med exempelskylten som bild. */
export function TopicCards({ topics, heading }: { topics: readonly Topic[]; heading?: string }) {
  return (
    <ul className={styles.cards} aria-label={heading}>
      {topics.map((topic) => (
        <li key={topic.slug}>
          <Link href={topicPath(topic)} className={styles.card}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={topicImagePath(topic)} width={TOPIC_IMAGE.width} height={TOPIC_IMAGE.height} alt="" loading="lazy" />
            <span className={styles.cardTitle}>{topic.title}</span>
            <span className={styles.cardText}>{topic.lead}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * En sida om namnskyltar (2026-11-25): rubrik och ingress, exempelskylten med en knapp som öppnar den i
 * skyltmotorn, priset ur prismodellen, sidans avsnitt, närbilden ur 3D-vyn, vanliga frågor och länkar vidare.
 */
export function TopicPage({
  topic,
  facts,
  exampleHref,
  related,
}: {
  topic: Topic;
  facts: SiteFacts;
  /** Skyltmotorn med exempelskylten öppnad. */
  exampleHref: string;
  related: readonly Topic[];
}) {
  return (
    <article className={styles.page}>
      <nav className={styles.crumbs} aria-label="Brödsmulor">
        <Link href="/">Start</Link>
        <span aria-hidden="true">/</span>
        <Link href={TOPIC_HUB.path}>Namnskyltar</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{topic.name}</span>
      </nav>

      <header className={styles.hero}>
        <div className={styles.heroText}>
          <p className={styles.eyebrow}>{topic.kind === "bransch" ? "Namnskyltar per bransch" : "Namnskyltar"}</p>
          <h1 className={styles.title}>{topic.title}</h1>
          <p className={styles.lead}>{topic.lead}</p>
          <div className={styles.actions}>
            <Link href={exampleHref} className="btn btn--primary btn--lg">
              Gör en sådan skylt
            </Link>
            <Link href="/skapa?t=" className="btn btn--ghost btn--lg">
              Börja från början
            </Link>
          </div>
        </div>
        <figure className={styles.example}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={topicImagePath(topic)}
            width={TOPIC_IMAGE.width}
            height={TOPIC_IMAGE.height}
            alt={`Exempel: ${topic.example}`}
            fetchPriority="high"
          />
          <figcaption>{topic.example}</figcaption>
        </figure>
      </header>

      <TopicPrices topic={topic} facts={facts} />

      <div className={styles.body}>
        <div className={styles.prose}>
          {topic.sections(facts).map((section) => (
            <section key={section.heading}>
              <h2>{section.heading}</h2>
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph.slice(0, 32)}>{paragraph}</p>
              ))}
            </section>
          ))}
        </div>
        {topic.photo ? (
          <figure className={styles.photo}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={topic.photo.src} width={topic.photo.width} height={topic.photo.height} alt={topic.photo.alt} loading="lazy" />
            <figcaption>{topic.photo.caption}</figcaption>
          </figure>
        ) : null}
      </div>

      <Faq bare title={`Vanliga frågor: ${topic.title.toLowerCase()}`} items={topic.faq(facts)} />

      <section className={styles.related} aria-labelledby="fler-namnskyltar">
        <h2 id="fler-namnskyltar" className={styles.relatedTitle}>
          Fler namnskyltar
        </h2>
        <TopicCards topics={related} />
        <p className={styles.all}>
          <Link href={TOPIC_HUB.path}>Alla namnskyltar och namnbrickor</Link>
        </p>
      </section>
    </article>
  );
}
