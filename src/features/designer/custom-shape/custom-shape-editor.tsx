"use client";

import { useMemo, useState, type Dispatch } from "react";
import { customOutlineIssue, matchingShapePreset, type BadgeDocument, type Point, type TracedOutline } from "@/engine";
import type { DesignerAction } from "../state";
import styles from "./custom-shape.module.css";
import { OutlineCanvas } from "./outline-canvas";
import { OutlineIssueNote } from "./outline-issue-note";
import { PresetGallery } from "./preset-gallery";
import { ShapeDescribe } from "./shape-describe";
import { ShapeSizeFields } from "./shape-size-fields";
import { ShapeUpload } from "./shape-upload";

const NO_POINTS: readonly Point[] = [];
/** En form ritad ur en beskrivning kommer från en bild med mjuka kanter, och får därför lite rundning från början. */
const DESCRIBED_CORNER_MM = 2;

interface CustomShapeEditorProps {
  /** Skylten, med `shape === "custom"`. */
  doc: BadgeDocument;
  dispatch: Dispatch<DesignerAction>;
}

/** Egen form: välj ett förslag, ladda upp en fil eller beskriv formen, rita om konturen och sätt mått och rundning. */
export function CustomShapeEditor({ doc, dispatch }: CustomShapeEditorProps) {
  const points = doc.customOutline ?? NO_POINTS;
  const issue = useMemo(() => customOutlineIssue(points, doc.size), [points, doc.size]);
  const preset = useMemo(() => matchingShapePreset(points, doc.size), [points, doc.size]);
  /** Räknas upp när formen byts ut helt, så att ritytan börjar om utan en vald punkt från den gamla formen. */
  const [revision, setRevision] = useState(0);
  /** Räknas upp när formen byts på annat sätt än med en fil, så att beskedet om en inläst fil inte står kvar över en annan form. */
  const [besideFile, setBesideFile] = useState(0);
  /** Samma sak för formen som ritas ur en beskrivning. */
  const [besideDescribed, setBesideDescribed] = useState(0);

  const pickPreset = (presetId: string) => {
    dispatch({ type: "custom/preset", presetId });
    setRevision((n) => n + 1);
    setBesideFile((n) => n + 1);
    setBesideDescribed((n) => n + 1);
  };

  const adoptFile = (outline: TracedOutline) => {
    dispatch({ type: "custom/replace", ...outline });
    // Filens form ska bli som den ritades, inte rundad som förslaget före den.
    dispatch({ type: "corner", cornerRadiusMm: 0 });
    setRevision((n) => n + 1);
    setBesideDescribed((n) => n + 1);
  };

  const adoptDescribed = (outline: TracedOutline) => {
    dispatch({ type: "custom/replace", ...outline });
    dispatch({ type: "corner", cornerRadiusMm: DESCRIBED_CORNER_MM });
    setRevision((n) => n + 1);
    setBesideFile((n) => n + 1);
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
        <ShapeUpload key={besideFile} onOutline={adoptFile} />
        <ShapeDescribe resetKey={besideDescribed} onOutline={adoptDescribed} />
      </section>

      <section className={styles.block} aria-labelledby="custom-shape-draw">
        <header className={styles.blockHead}>
          <h3 id="custom-shape-draw" className={styles.blockTitle}>
            Rita om formen
          </h3>
          <span className={styles.note}>Streckad ruta = skyltens mått. Klicka på ett mått för att ändra det.</span>
        </header>
        <OutlineCanvas
          key={revision}
          doc={doc}
          issue={issue}
          onChange={(next) => dispatch({ type: "custom/outline", points: next })}
          onResize={(change) => dispatch({ type: "custom/size", ...change })}
        />
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
