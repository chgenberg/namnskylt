"use client";

import { AnimatePresence, motion } from "motion/react";
import type { Dispatch } from "react";
import { PanelSection } from "@/components/ui/panel-section";
import { Segmented } from "@/components/ui/segmented";
import { FONTS, TEXT_LIMITS, type BadgeDocument, type BadgeLayout, type TextAlign } from "@/engine";
import type { DesignerAction } from "../state";
import styles from "./sections.module.css";

const ROW_PLACEHOLDERS = ["Namn", "Titel", "Avdelning"];
const CAP_SLIDER = { min: 2, max: 12, step: 0.1 } as const;

const ALIGN_OPTIONS: readonly { id: TextAlign; label: React.ReactNode; title: string }[] = [
  { id: "left", title: "Vänster", label: <AlignIcon lines={[16, 10, 13]} anchor="left" /> },
  { id: "center", title: "Centrerat", label: <AlignIcon lines={[16, 10, 13]} anchor="center" /> },
  { id: "right", title: "Höger", label: <AlignIcon lines={[16, 10, 13]} anchor="right" /> },
];

function AlignIcon({ lines, anchor }: { lines: number[]; anchor: TextAlign }) {
  return (
    <svg viewBox="0 0 20 16" width="18" height="14" aria-hidden="true">
      {lines.map((length, i) => {
        const x = anchor === "left" ? 2 : anchor === "right" ? 18 - length : 10 - length / 2;
        return <rect key={i} x={x} y={2 + i * 5} width={length} height="1.6" rx=".8" fill="currentColor" />;
      })}
    </svg>
  );
}

function formatMm(value: number): string {
  return value.toLocaleString("sv-SE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

interface TextSectionProps {
  doc: BadgeDocument;
  layout: BadgeLayout;
  dispatch: Dispatch<DesignerAction>;
  /** Öppnar ritningen där text och logga dras runt. */
  onPlace?: () => void;
  placing?: boolean;
}

export function TextSection({ doc, layout, dispatch, onPlace, placing = false }: TextSectionProps) {
  const canAdd = doc.rows.length < TEXT_LIMITS.maxRows;

  return (
    <PanelSection step={1} title="Text" aside={`${doc.rows.length}/${TEXT_LIMITS.maxRows} rader`}>
      <ul className={styles.rows}>
        <AnimatePresence initial={false}>
          {doc.rows.map((row, i) => {
            const issue = layout.issues.find((x) => x.rowId === row.id);
            const drawn = layout.rows.find((r) => r.id === row.id);
            const fill = ((row.capHeightMm - CAP_SLIDER.min) / (CAP_SLIDER.max - CAP_SLIDER.min)) * 100;
            return (
              <motion.li
                key={row.id}
                layout
                className={styles.rowCard}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              >
                <div className={styles.rowInner}>
                  <div className="field">
                    <input
                      aria-label={`Rad ${i + 1}`}
                      value={row.text}
                      placeholder={ROW_PLACEHOLDERS[i]}
                      maxLength={TEXT_LIMITS.maxChars}
                      onChange={(e) => dispatch({ type: "row/text", id: row.id, text: e.target.value })}
                    />
                    <button
                      type="button"
                      className={styles.iconButton}
                      aria-pressed={row.bold}
                      title="Fet"
                      onClick={() => dispatch({ type: "row/bold", id: row.id })}
                    >
                      <strong>B</strong>
                    </button>
                    {doc.rows.length > 1 && (
                      <button
                        type="button"
                        className={styles.iconButton}
                        title="Ta bort rad"
                        aria-label={`Ta bort rad ${i + 1}`}
                        onClick={() => dispatch({ type: "row/remove", id: row.id })}
                      >
                        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                          <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                      </button>
                    )}
                  </div>
                  <label className={styles.sliderRow}>
                    <span className={styles.sliderLabel}>Versalhöjd</span>
                    <input
                      type="range"
                      className="range"
                      min={CAP_SLIDER.min}
                      max={CAP_SLIDER.max}
                      step={CAP_SLIDER.step}
                      value={row.capHeightMm}
                      style={{ "--range-fill": `${fill}%` } as React.CSSProperties}
                      onChange={(e) =>
                        dispatch({ type: "row/cap", id: row.id, capHeightMm: Number(e.target.value) })
                      }
                    />
                    <span className={`mono ${styles.sliderValue}`}>{formatMm(row.capHeightMm)} mm</span>
                  </label>
                  {issue && drawn && (
                    <p className={styles.issue} data-severity={issue.code === "row-too-long" ? "error" : "info"}>
                      {issue.code === "row-too-long"
                        ? "Texten ryms inte — korta den eller välj en större skylt."
                        : `Graveras med ${formatMm(drawn.capHeightMm)} mm så att raden ryms.`}
                    </p>
                  )}
                </div>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>

      {canAdd && (
        <button type="button" className={`btn btn--ghost ${styles.addRow}`} onClick={() => dispatch({ type: "row/add", id: crypto.randomUUID() })}>
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          Lägg till rad
        </button>
      )}

      <div className={styles.typeRow}>
        <Segmented
          label="Typsnitt"
          value={doc.font}
          options={FONTS.map((f) => ({ id: f.id, label: f.name }))}
          onChange={(font) => dispatch({ type: "font", font })}
        />
        <Segmented
          label="Justering"
          value={doc.align}
          options={ALIGN_OPTIONS}
          onChange={(align) => dispatch({ type: "align", align })}
        />
      </div>

      {onPlace && (
        <button type="button" className={`btn btn--ghost ${styles.addRow}`} onClick={onPlace}>
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path
              d="M8 2v12M2 8h12M8 2 6.5 3.5M8 2l1.5 1.5M8 14l-1.5-1.5M8 14l1.5-1.5M2 8l1.5-1.5M2 8l1.5 1.5M14 8l-1.5-1.5M14 8l-1.5 1.5"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              fill="none"
            />
          </svg>
          {placing ? "Dra texten eller loggan på skylten till vänster" : "Flytta text och logga fritt på skylten"}
        </button>
      )}
    </PanelSection>
  );
}
