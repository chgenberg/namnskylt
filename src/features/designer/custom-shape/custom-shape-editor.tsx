"use client";

import { useMemo, useState, type Dispatch } from "react";
import { customOutlineIssue, matchingShapePreset, type BadgeDocument, type Point, type TracedOutline } from "@/engine";
import type { DesignerAction } from "../state";
import styles from "./custom-shape.module.css";
import { OutlineCanvas } from "./outline-canvas";
import { OutlineIssueNote } from "./outline-issue-note";
import { PresetGallery } from "./preset-gallery";
import { ShapeSizeFields } from "./shape-size-fields";
import { ShapeUpload } from "./shape-upload";

const NO_POINTS: readonly Point[] = [];

interface CustomShapeEditorProps {
  /** Skylten, med `shape === "custom"`. */
  doc: BadgeDocument;
  dispatch: Dispatch<DesignerAction>;
}

/** Egen form: välj ett förslag eller ladda upp en fil, rita om konturen och sätt mått och rundning. */
export function CustomShapeEditor({ doc, dispatch }: CustomShapeEditorProps) {
  const points = doc.customOutline ?? NO_POINTS;
  const issue = useMemo(() => customOutlineIssue(points, doc.size), [points, doc.size]);
  const preset = useMemo(() => matchingShapePreset(points, doc.size), [points, doc.size]);
  /** Räknas upp när formen byts ut helt, så att ritytan börjar om utan en vald punkt från den gamla formen. */
  const [revision, setRevision] = useState(0);
  /** Räknas upp när ett förslag väljs, så att beskedet om en inläst fil inte står kvar över en annan form. */
  const [presetPicks, setPresetPicks] = useState(0);

  const pickPreset = (presetId: string) => {
    dispatch({ type: "custom/preset", presetId });
    setRevision((n) => n + 1);
    setPresetPicks((n) => n + 1);
  };

  const adoptFile = (outline: TracedOutline) => {
    dispatch({ type: "custom/replace", ...outline });
    // Filens form ska bli som den ritades, inte rundad som förslaget före den.
    dispatch({ type: "corner", cornerRadiusMm: 0 });
    setRevision((n) => n + 1);
  };

  return (
    <div className={styles.editor}>
      <section className={styles.block} aria-labelledby="custom-shape-start">
        <header className={styles.blockHead}>
          <h3 id="custom-shape-start" className={styles.blockTitle}>
            Börja från ett förslag
          </h3>
          <span className={styles.note}>eller din egen fil</span>
        </header>
        <PresetGallery activeId={preset?.id ?? null} onPick={pickPreset} />
        <ShapeUpload key={presetPicks} onOutline={adoptFile} />
      </section>

      <section className={styles.block} aria-labelledby="custom-shape-draw">
        <header className={styles.blockHead}>
          <h3 id="custom-shape-draw" className={styles.blockTitle}>
            Rita om formen
          </h3>
          <span className={styles.note}>Streckad ruta = skyltens mått</span>
        </header>
        <OutlineCanvas key={revision} doc={doc} issue={issue} onChange={(next) => dispatch({ type: "custom/outline", points: next })} />
        {issue && <OutlineIssueNote issue={issue} />}
      </section>

      <section className={styles.block} aria-labelledby="custom-shape-size">
        <header className={styles.blockHead}>
          <h3 id="custom-shape-size" className={styles.blockTitle}>
            Mått och rundning
          </h3>
        </header>
        <ShapeSizeFields doc={doc} dispatch={dispatch} />
      </section>
    </div>
  );
}
