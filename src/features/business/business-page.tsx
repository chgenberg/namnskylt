import Link from "next/link";
import type { CSSProperties } from "react";
import { BadgePreview } from "@/components/badge-preview";
import { INPUT_ANCHOR } from "@/features/home/smart-input";
import {
  MAX_ORDER_BADGES,
  QUANTITY_TIERS,
  createBadgeDocument,
  type BadgeDocument,
  type MaterialId,
  type MountingId,
} from "@/engine";
import {
  HERO,
  HOW,
  OUTRO,
  QUOTE,
  SCENES,
  STORY_INTRO,
  VOLUME,
  WORKPLACES,
  WORKPLACES_INTRO,
} from "./business-copy";
import styles from "./business.module.css";

const VOLUME_ANCHOR = "mangdrabatt";

function badge(
  texts: readonly string[],
  materialId: MaterialId = "plastic-2-layer",
  colorId = "white-black",
  mounting: MountingId = "pin",
): BadgeDocument {
  return { ...createBadgeDocument([...texts]), materialId, colorId, mounting };
}

/** Skyltarna på anslagstavlan i toppen — lite snett, som när de ligger framme. */
const BOARD = [
  { doc: badge(["Sara Ek", "Butikschef"], "plastic-2-layer", "darkblue-white"), x: "4%", y: "10%", tilt: "-6deg" },
  { doc: badge(["Johan Nyström", "Kock"], "plastic-2-layer", "black-white"), x: "50%", y: "2%", tilt: "4deg" },
  { doc: badge(["Lena Björk", "Reception"], "stainless", "steel-laser"), x: "26%", y: "40%", tilt: "-2deg" },
  { doc: badge(["Ahmed Karimi", "Sjuksköterska"], "plastic-2-layer", "white-blue"), x: "58%", y: "52%", tilt: "7deg" },
  { doc: badge(["Elsa Lind", "Lärare"], "plastic-2-layer", "darkgreen-white"), x: "2%", y: "70%", tilt: "3deg" },
] as const;

const TEAM_LIST = ["Sara Ek, Butikschef", "Wilma Berg, Butikssäljare", "Johan Nyström, Lager", "Elsa Lind, Kassa"];

interface VolumeRow {
  range: string;
  discount: string;
}

function volumeRows(): VolumeRow[] {
  const tiers = [...QUANTITY_TIERS].sort((a, b) => a.minQuantity - b.minQuantity);
  return tiers.map((tier, i) => {
    const next = tiers[i + 1];
    const range = next ? `${tier.minQuantity}–${next.minQuantity - 1} st` : `${tier.minQuantity} st eller fler`;
    const percent = Math.round((1 - tier.factor) * 100);
    return { range, discount: percent === 0 ? "Ordinarie pris" : `−${percent} %` };
  });
}

function Arrow() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path d="M3 8h10M9 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function BusinessPage() {
  return (
    <>
      <section className={styles.hero}>
        <div className={styles.glow} aria-hidden="true" />
        <div className={`container ${styles.heroInner}`}>
          <div className={styles.heroCopy}>
            <p className="eyebrow">{HERO.eyebrow}</p>
            <h1 className={styles.heroTitle}>{HERO.title}</h1>
            <p className={styles.heroLead}>{HERO.lead}</p>
            <div className={styles.heroActions}>
              <Link href={`/#${INPUT_ANCHOR}`} className="btn btn--primary btn--lg">
                {HERO.primary}
              </Link>
              <a href={`#${VOLUME_ANCHOR}`} className="btn btn--ghost btn--lg">
                {HERO.secondary}
              </a>
            </div>
          </div>
          <div className={`${styles.board} dot-grid`} role="img" aria-label="Namnskyltar för olika yrken">
            {BOARD.map(({ doc, x, y, tilt }) => (
              <div
                key={doc.rows[0]?.text}
                className={styles.boardItem}
                style={{ "--x": x, "--y": y, "--tilt": tilt } as CSSProperties}
              >
                <BadgePreview doc={doc} />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.story} aria-labelledby="vecka-titel">
        <div className={`container ${styles.storyIntro}`}>
          <p className="eyebrow">{STORY_INTRO.eyebrow}</p>
          <h2 id="vecka-titel" className={styles.sectionTitle}>
            {STORY_INTRO.title}
          </h2>
        </div>

        <ol className={`container ${styles.scenes}`}>
          {SCENES.map((scene, i) => (
            <li key={scene.time} className={styles.scene}>
              <p className={styles.when}>
                <span className="mono">{scene.time}</span>
                <span>{scene.place}</span>
              </p>
              <div className={styles.sceneCopy}>
                <h3 className={styles.sceneTitle}>{scene.title}</h3>
                {scene.body.map((paragraph) => (
                  <p key={paragraph.slice(0, 32)}>{paragraph}</p>
                ))}
              </div>
              {i === 1 && (
                <blockquote className={styles.quote}>
                  <p>{QUOTE}</p>
                </blockquote>
              )}
            </li>
          ))}
        </ol>
      </section>

      <section className={styles.how} aria-labelledby="team-titel">
        <div className={`container ${styles.howInner}`}>
          <div>
            <p className="eyebrow">{HOW.eyebrow}</p>
            <h2 id="team-titel" className={styles.sectionTitle}>
              {HOW.title}
            </h2>
            <ol className={styles.howSteps}>
              {HOW.steps.map((step, i) => (
                <li key={step.title}>
                  <span className={`mono ${styles.howNumber}`}>{i + 1}</span>
                  <div>
                    <h3>{step.title}</h3>
                    <p>{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
            <p className={styles.howNote}>Upp till {MAX_ORDER_BADGES} namn i samma beställning.</p>
          </div>

          <div className={styles.teamPanel} role="img" aria-label="En lista med namn blir en skylt per person">
            <div className={styles.sheet}>
              {TEAM_LIST.map((line) => (
                <span key={line} className="mono">
                  {line}
                </span>
              ))}
            </div>
            <span className={styles.sheetArrow} aria-hidden="true" />
            <div className={styles.teamBadges}>
              {TEAM_LIST.map((line) => (
                <BadgePreview key={line} doc={badge(line.split(", "), "plastic-2-layer", "black-white")} />
              ))}
            </div>
          </div>
        </div>

        <div id={VOLUME_ANCHOR} className={`container ${styles.volume}`}>
          <div>
            <h3 className={styles.volumeTitle}>{VOLUME.title}</h3>
            <p className={styles.volumeBody}>{VOLUME.body}</p>
          </div>
          <dl className={styles.volumeTable}>
            {volumeRows().map((row) => (
              <div key={row.range} data-base={row.discount === "Ordinarie pris"}>
                <dt>{row.range}</dt>
                <dd>{row.discount}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className={styles.workplaces} aria-labelledby="miljoer-titel">
        <div className={`container ${styles.storyIntro}`}>
          <p className="eyebrow">{WORKPLACES_INTRO.eyebrow}</p>
          <h2 id="miljoer-titel" className={styles.sectionTitle}>
            {WORKPLACES_INTRO.title}
          </h2>
        </div>
        <ul className={`container ${styles.grid}`}>
          {WORKPLACES.map((place) => (
            <li key={place.title} className={styles.card}>
              <div className={styles.cardStage}>
                <BadgePreview
                  doc={badge(place.badge.texts, place.badge.materialId, place.badge.colorId, place.badge.mounting)}
                  className={styles.cardBadge}
                />
              </div>
              <h3>{place.title}</h3>
              <p>{place.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.outro}>
        <div className={`container ${styles.outroInner}`}>
          <h2 className={styles.outroTitle}>{OUTRO.title}</h2>
          <p>{OUTRO.body}</p>
          <Link href={`/#${INPUT_ANCHOR}`} className="btn btn--primary btn--lg">
            {OUTRO.cta}
            <Arrow />
          </Link>
        </div>
      </section>
    </>
  );
}
