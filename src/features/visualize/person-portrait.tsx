"use client";

import { motion } from "motion/react";
import { GeneratingStatus } from "./generating-status";
import { MAX_WORKPLACE_CHARS } from "@/lib/ai/prompts";
import type { VisualizeState } from "./use-visualize";
import styles from "./visualize.module.css";

const STEPS = [
  [0, "Läser namnet…"],
  [4, "Castar en person som passar…"],
  [10, "Fäster skylten på bröstet…"],
  [20, "Ljussätter och fotograferar…"],
  [40, "Sista finputsen…"],
] as const;

interface PersonPortraitProps {
  state: VisualizeState;
}

export function PersonPortrait({ state }: PersonPortraitProps) {
  const { person, generatePerson, isStale, workplace, setWorkplace } = state;
  const working = person.status === "working";
  const image = person.status === "done" ? person.result : null;

  return (
    <div className={styles.mode}>
      <header className={styles.modeHead}>
        <div>
          <h2 className={styles.modeTitle}>Din skylt på en person</h2>
          <p className={styles.modeLead}>
            En fotorealistisk bild där kön och ålder passar namnet på skylten — på er arbetsplats.
          </p>
        </div>
        <button type="button" className="btn btn--primary" disabled={working} onClick={generatePerson}>
          {image ? "Skapa ny" : "Visa på en person"}
        </button>
      </header>

      <label className={`field ${styles.workplace}`}>
        <span className={styles.workplaceLabel}>Miljö</span>
        <input
          type="text"
          value={workplace}
          maxLength={MAX_WORKPLACE_CHARS}
          placeholder="T.ex. hotellreception, tandläkarmottagning, butik med kassor"
          onChange={(e) => setWorkplace(e.target.value)}
        />
      </label>

      {isStale(person) && <p className={styles.notice}>Skylten har ändrats sedan bilden skapades.</p>}
      {person.status === "error" && (
        <p className={styles.error} role="alert">
          {person.message}
        </p>
      )}

      <div className={styles.portrait} aria-busy={working}>
        {image ? (
          <motion.figure
            key={image.slice(-32)}
            className={styles.card}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- data-URL från API:t */}
            <img src={image} alt="En person som bär namnskylten" />
            <a className={`chip ${styles.download}`} href={image} download="namnskylt-person.jpg">
              Ladda ner
            </a>
          </motion.figure>
        ) : (
          <div className={styles.card} data-state={working ? "working" : "empty"} aria-hidden="true">
            <span className={styles.cardFigure} />
          </div>
        )}
      </div>

      {working && <GeneratingStatus startedAt={person.startedAt} steps={STEPS} />}
    </div>
  );
}
