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
  /** Skylten i editorn — först i listan. */
  current: BadgeDocument;
  /** Skyltarna som skapats ur textrutan, i samma ordning. */
  badges: readonly BadgeDocument[];
  text: string;
  onTextChange: (text: string) => void;
  /** Öppnar kollegans skylt i editorn; den som redigerades tar hennes plats i listan. */
  onSelect: (index: number) => void;
  /** Tar bort skylten i editorn — nästa i listan tar över. */
  onRemoveCurrent: () => void;
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

/** Namnet är nyckeln, så att en skylt som byter plats glider dit i stället för att blinka. */
function itemKey(doc: BadgeDocument, index: number): string {
  return `${batchLine(doc) || "tom"}#${index}`;
}

export function BatchSection({
  current,
  badges,
  text,
  onTextChange,
  onSelect,
  onRemoveCurrent,
  overflow,
  fonts,
}: BatchSectionProps) {
  const all = useMemo(() => [current, ...badges], [current, badges]);
  const notes = useMemo(() => all.map((doc) => fitNote(doc, fonts)), [all, fonts]);
  const keys = useMemo(() => {
    const seen = new Map<string, number>();
    return all.map((doc) => {
      const line = batchLine(doc) || "tom";
      const n = seen.get(line) ?? 0;
      seen.set(line, n + 1);
      return itemKey(doc, n);
    });
  }, [all]);

  return (
    <PanelSection
      step={6}
      title="Fler namn"
      aside={badges.length > 0 ? `${badges.length + 1} skyltar` : "Samma design"}
    >
      <p className={styles.batchLead}>
        Skylt till hela teamet? Skriv en skylt per rad — namn, titel. Alla får designen ovan. Klicka på en skylt i listan
        för att se och ändra den.
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
        <ul className={styles.batchList} aria-label="Alla skyltar i ordern">
          <AnimatePresence initial={false}>
            {all.map((doc, position) => {
              const line = batchLine(doc) || "Utan text";
              const note = notes[position];
              const editing = position === 0;
              return (
                <motion.li
                  key={keys[position]}
                  layout="position"
                  className={styles.batchItem}
                  data-current={editing || undefined}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                >
                  <button
                    type="button"
                    className={styles.batchOpen}
                    aria-current={editing ? "true" : undefined}
                    aria-label={editing ? `${line} — redigeras nu` : `Redigera ${line}`}
                    onClick={() => !editing && onSelect(position - 1)}
                  >
                    <BadgePreview doc={doc} className={styles.batchPreview} />
                    <span className={styles.batchMeta}>
                      <span className={styles.batchName}>{line}</span>
                      {editing ? (
                        <span className={styles.batchEditing}>Redigeras</span>
                      ) : note ? (
                        <span className={styles.batchNote} data-severity={note === "Får inte plats" ? "error" : "warning"}>
                          {note}
                        </span>
                      ) : (
                        <span className={styles.batchHint}>Klicka för att ändra</span>
                      )}
                      {editing && note && (
                        <span className={styles.batchNote} data-severity={note === "Får inte plats" ? "error" : "warning"}>
                          {note}
                        </span>
                      )}
                    </span>
                  </button>
                  <button
                    type="button"
                    className={styles.iconButton}
                    aria-label={`Ta bort ${line}`}
                    onClick={() => (editing ? onRemoveCurrent() : onTextChange(removeBatchEntry(text, position - 1)))}
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
