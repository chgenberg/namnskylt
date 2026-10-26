"use client";

import { motion } from "motion/react";
import { GeneratingStatus } from "./generating-status";
import type { VisualizeState } from "./use-visualize";
import styles from "./visualize.module.css";

const PEOPLE_COUNT = 3;

const STEPS = [
  [0, "Castar tre personer…"],
  [6, "Fäster skylten på kavajslaget…"],
  [18, "Ljussätter och fotograferar…"],
  [40, "Sista finputsen…"],
] as const;

interface PeopleGalleryProps {
  state: VisualizeState;
}

export function PeopleGallery({ state }: PeopleGalleryProps) {
  const { people, generatePeople, isStale } = state;
  const working = people.status === "working";
  const images = people.status === "done" ? people.result : null;

  return (
    <div className={styles.mode}>
      <header className={styles.modeHead}>
        <div>
          <h2 className={styles.modeTitle}>Tre personer, din skylt</h2>
          <p className={styles.modeLead}>
            Fotorealistiska bilder på svenska personer som bär exakt den här skylten.
          </p>
        </div>
        <button
          type="button"
          className="btn btn--primary"
          disabled={working}
          onClick={generatePeople}
        >
          {images ? "Skapa nya" : "Visa på tre personer"}
        </button>
      </header>

      {isStale(people) && (
        <p className={styles.notice}>Skylten har ändrats sedan bilderna skapades.</p>
      )}
      {people.status === "error" && (
        <p className={styles.error} role="alert">
          {people.message}
        </p>
      )}

      <div className={styles.gallery} aria-busy={working}>
        {Array.from({ length: PEOPLE_COUNT }, (_, index) => {
          const image = images?.[index];
          if (image) {
            return (
              <motion.figure
                key={image.slice(-32)}
                className={styles.card}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.12, ease: [0.22, 1, 0.36, 1] }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- data-URL från API:t */}
                <img src={image} alt={`Person ${index + 1} som bär namnskylten`} />
                <a className={`chip ${styles.download}`} href={image} download={`namnskylt-${index + 1}.jpg`}>
                  Ladda ner
                </a>
              </motion.figure>
            );
          }
          return (
            <div
              key={`placeholder-${index}`}
              className={styles.card}
              data-state={working ? "working" : "empty"}
              aria-hidden="true"
            >
              <span className={styles.cardFigure} />
            </div>
          );
        })}
      </div>

      {working && <GeneratingStatus startedAt={people.startedAt} steps={STEPS} />}
    </div>
  );
}
