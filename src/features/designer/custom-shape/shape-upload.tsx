"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
import type { TracedOutline } from "@/engine";
import styles from "./custom-shape.module.css";
import { SHAPE_FILE_ACCEPT, readShapeFile } from "./read-shape-file";

type Status =
  | { kind: "idle" }
  | { kind: "working" }
  | { kind: "done"; fileName: string }
  | { kind: "error"; message: string };

interface ShapeUploadProps {
  onOutline: (outline: TracedOutline) => void;
}

/** Kundens egen fil blir formen: filen spåras till sin ytterkant och ersätter konturen. */
export function ShapeUpload({ onOutline }: ShapeUploadProps) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [dragging, setDragging] = useState(false);
  const working = status.kind === "working";
  // Inläsningen kan ta flera sekunder (PDF). Har kunden hunnit välja något annat
  // och uppladdningen monterats om eller stängts, ska resultatet kastas.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const read = async (file: File | undefined) => {
    if (!file || working) return;
    setStatus({ kind: "working" });
    const result = await readShapeFile(file).catch(() => null);
    if (!mounted.current) return;
    if (!result?.ok) {
      setStatus({ kind: "error", message: result?.message ?? "Filen gick inte att läsa." });
      return;
    }
    onOutline(result.outline);
    setStatus({ kind: "done", fileName: file.name });
  };

  const drop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragging(false);
    void read(event.dataTransfer.files[0]);
  };

  return (
    <div className={styles.uploadBlock}>
      <label
        className={styles.upload}
        data-dragging={dragging || undefined}
        aria-busy={working}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={drop}
      >
        <svg className={styles.uploadIcon} viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 15V4M7.5 8.5 12 4l4.5 4.5" />
          <path d="M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" />
        </svg>
        <span className={styles.uploadText}>
          <span className={styles.uploadTitle}>{working ? "Läser filen…" : "Ladda upp en egen form"}</span>
          <span className={styles.note}>SVG, PNG, JPG eller PDF, högst 8 MB. Vi följer figurens ytterkant.</span>
        </span>
        <input
          type="file"
          accept={SHAPE_FILE_ACCEPT}
          className="visually-hidden"
          disabled={working}
          onChange={(event) => {
            void read(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </label>
      {status.kind === "error" && (
        <p className={styles.uploadStatus} data-severity="error" role="alert">
          {status.message}
        </p>
      )}
      {status.kind === "done" && (
        <p className={styles.uploadStatus} role="status">
          Formen ur {status.fileName} är inläst, i största tillåtna mått. Ändra måttet, dra i punkterna eller öka hörnrundningen om
          kanterna ska bli mjukare.
        </p>
      )}
    </div>
  );
}
