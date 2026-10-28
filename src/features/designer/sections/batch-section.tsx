"use client";

import { AnimatePresence, motion } from "motion/react";
import { useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { BadgePreview } from "@/components/badge-preview";
import { PanelSection } from "@/components/ui/panel-section";
import {
  MAX_ORDER_BADGES,
  batchLine,
  layoutBadge,
  removeBatchEntry,
  rosterFromTable,
  rosterText,
  type BadgeDocument,
  type FontEngine,
  type Roster,
} from "@/engine";
import { readTable, SpreadsheetError } from "@/lib/spreadsheet/read-table";
import styles from "./sections.module.css";

const ACCEPT = ".xlsx,.csv,.tsv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv";

type ImportStatus = { kind: "ok"; text: string } | { kind: "error"; text: string } | null;

function describeImport(roster: Roster, fileName: string): string {
  const people = roster.entries.length === 1 ? "1 namn" : `${roster.entries.length} namn`;
  if (!roster.columns) return `${people} från ${fileName}. Kolla att namn och titel hamnade rätt.`;
  const title = roster.columns.title ? ` och titel ur ”${roster.columns.title}”` : "";
  return `${people} från ${fileName} — namn ur ”${roster.columns.name}”${title}.`;
}

function useRosterImport(text: string, onTextChange: (text: string) => void) {
  const [status, setStatus] = useState<ImportStatus>(null);
  const [busy, setBusy] = useState(false);

  async function importFile(file: File) {
    setBusy(true);
    try {
      const table = await readTable(file.name, new Uint8Array(await file.arrayBuffer()));
      const roster = rosterFromTable(table);
      if (roster.entries.length === 0) {
        setStatus({ kind: "error", text: `Hittade inga namn i ${file.name}.` });
        return;
      }
      const lines = rosterText(roster.entries);
      onTextChange(text.trim() ? `${text.trimEnd()}\n${lines}` : lines);
      setStatus({ kind: "ok", text: describeImport(roster, file.name) });
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof SpreadsheetError ? error.message : `${file.name} gick inte att läsa.`,
      });
    } finally {
      setBusy(false);
    }
  }

  return { status, busy, importFile };
}

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

  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const { status, busy, importFile } = useRosterImport(text, onTextChange);

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void importFile(file);
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    const file = event.dataTransfer.files[0];
    setDragging(false);
    if (!file) return;
    event.preventDefault();
    void importFile(file);
  }

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
      <label
        className={styles.batchField}
        data-dragging={dragging || undefined}
        onDragOver={(event) => {
          if (!event.dataTransfer.types.includes("Files")) return;
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        <span className="visually-hidden">Fler namn, en skylt per rad</span>
        <textarea
          value={text}
          onChange={(event) => onTextChange(event.target.value)}
          placeholder={PLACEHOLDER}
          rows={4}
          spellCheck={false}
        />
        {dragging && <span className={styles.dropHint}>Släpp filen här</span>}
      </label>
      <div className={styles.importRow}>
        <button
          type="button"
          className={styles.importButton}
          onClick={() => fileRef.current?.click()}
          disabled={busy}
        >
          <span aria-hidden>↑</span> {busy ? "Läser filen…" : "Ladda upp Excel"}
        </button>
        <p className={styles.hint}>Vi hittar namn och titel själva. .xlsx eller CSV — eller dra hit filen.</p>
        <input ref={fileRef} type="file" accept={ACCEPT} hidden onChange={handleFile} />
      </div>
      {status && (
        <p
          className={status.kind === "ok" ? styles.importOk : styles.issue}
          data-severity={status.kind === "error" ? "error" : undefined}
          role={status.kind === "error" ? "alert" : "status"}
        >
          {status.text}
        </p>
      )}

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
