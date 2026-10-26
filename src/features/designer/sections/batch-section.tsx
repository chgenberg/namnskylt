"use client";

import { AnimatePresence, motion } from "motion/react";
import { useMemo } from "react";
import { BadgePreview } from "@/components/badge-preview";
import { PanelSection } from "@/components/ui/panel-section";
import {
  MAX_ORDER_BADGES,
  batchLine,
  layoutBadge,
  removeBatchEntry,
  type BadgeDocument,
  type FontEngine,
} from "@/engine";
import styles from "./sections.module.css";

const PLACEHOLDER = "Erik Holm, Överläkare\nWilma Berg, Barista\nMarcus Holm, VD";

interface BatchSectionProps {
  /** Skyltarna som skapats ur textrutan, i samma ordning. */
  badges: readonly BadgeDocument[];
  text: string;
  onTextChange: (text: string) => void;
  /** Rader i textrutan som inte fick plats i ordern. */
  overflow: number;
  fonts: FontEngine;
}

function fitNote(doc: BadgeDocument, fonts: FontEngine): string | null {
  const { issues } = layoutBadge(doc, fonts);
  if (issues.some((issue) => issue.code === "row-too-long")) return "Får inte plats";
  if (issues.some((issue) => issue.code === "row-shrunk")) return "Texten krymps";
  return null;
}

export function BatchSection({ badges, text, onTextChange, overflow, fonts }: BatchSectionProps) {
  const notes = useMemo(() => badges.map((doc) => fitNote(doc, fonts)), [badges, fonts]);

  return (
    <PanelSection
      step={5}
      title="Fler namn"
      aside={badges.length > 0 ? `+${badges.length} skyltar` : "Samma design"}
    >
      <p className={styles.batchLead}>
        Skylt till hela teamet? Skriv en skylt per rad — namn, titel. Alla får designen ovan.
      </p>
      <label className={styles.batchField}>
        <span className="visually-hidden">Fler namn, en skylt per rad</span>
        <textarea
          value={text}
          onChange={(event) => onTextChange(event.target.value)}
          placeholder={PLACEHOLDER}
          rows={4}
          spellCheck={false}
        />
      </label>
      <p className={styles.hint}>Komma eller | delar rader. Klistra in två kolumner från Excel fungerar också.</p>

      {overflow > 0 && (
        <p className={styles.issue} data-severity="error" role="alert">
          En order rymmer högst {MAX_ORDER_BADGES} skyltar — {overflow} rader kommer inte med.
        </p>
      )}

      {badges.length > 0 && (
        <ul className={styles.batchList} aria-label="Skyltar med samma design">
          <AnimatePresence initial={false}>
            {badges.map((doc, index) => {
              const line = batchLine(doc);
              const note = notes[index];
              return (
                <motion.li
                  key={`${index}-${line}`}
                  layout="position"
                  className={styles.batchItem}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                >
                  <BadgePreview doc={doc} className={styles.batchPreview} />
                  <div className={styles.batchMeta}>
                    <span className={styles.batchName}>{line}</span>
                    {note && (
                      <span className={styles.batchNote} data-severity={note === "Får inte plats" ? "error" : "warning"}>
                        {note}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    className={styles.iconButton}
                    aria-label={`Ta bort ${line}`}
                    onClick={() => onTextChange(removeBatchEntry(text, index))}
                  >
                    ×
                  </button>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}
    </PanelSection>
  );
}
