"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { TracedOutline } from "@/engine";
import { SHAPE_DESCRIPTION_MAX, cleanShapeDescription } from "@/lib/ai/shape-prompt";
import styles from "./custom-shape.module.css";
import { drawDescribedShape, shapeDrawingAvailable } from "./draw-shape";

type Status = { kind: "idle" } | { kind: "working" } | { kind: "done" } | { kind: "error"; message: string };

const IDLE: Status = { kind: "idle" };

interface ShapeDescribeProps {
  onOutline: (outline: TracedOutline) => void;
  /**
   * Ändras när formen byts på ett annat sätt, till exempel med ett förslag
   * eller en uppladdad fil. Då avbryts en ritning som pågår, och beskedet om
   * den förra ritade formen står inte kvar över en annan form.
   */
  resetKey: number;
}

interface DrawingDialogProps {
  description: string;
  onCancel: () => void;
}

/**
 * Rutan som ligger över sidan medan formen ritas. Ritningen tar tio sekunder
 * eller mer, och utan en tydlig väntruta ser det ut som att inget händer
 * (besked via ägaren 2026-11-16). Stapeln visar ungefär hur långt det har gått:
 * den följer tiden, inte servern, och går därför aldrig ända fram.
 */
function DrawingDialog({ description, onCancel }: DrawingDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => dialog?.close();
  }, []);

  return (
    <dialog
      ref={ref}
      className={styles.drawing}
      aria-labelledby={titleId}
      onCancel={(event) => {
        // Esc avbryter ritningen, i stället för att bara stänga rutan medan anropet går vidare.
        event.preventDefault();
        onCancel();
      }}
    >
      <svg className={styles.drawingMark} viewBox="0 0 64 64" aria-hidden="true">
        <path pathLength={1} d="M32 7 53 15v19c0 12-9 20-21 24C20 54 11 46 11 34V15Z" />
      </svg>
      <h3 id={titleId} className={styles.drawingTitle}>
        Vi ritar din form
      </h3>
      <p className={styles.drawingWhat}>”{description}”</p>
      <div className={styles.drawingBar} aria-hidden="true">
        <span />
      </div>
      <p className={styles.note} role="status">
        Det tar oftast tio till femton sekunder, som längst en halv minut. Sedan justerar du formen genom att dra i punkterna.
      </p>
      <button type="button" className="btn btn--ghost" onClick={onCancel}>
        Avbryt
      </button>
    </dialog>
  );
}

/**
 * Kunden beskriver formen med ord, och servern ritar en siluett som blir
 * skyltens egna form, på samma sätt som en uppladdad bild. Rutan visas bara
 * när servern har bildmodellen inkopplad.
 */
export function ShapeDescribe({ onOutline, resetKey }: ShapeDescribeProps) {
  const inputId = useId();
  const [available, setAvailable] = useState(false);
  const [text, setText] = useState("");
  /** Läget hör till den form det gällde: byts formen på annat håll (`resetKey`) är läget inte längre aktuellt. */
  const [stored, setStored] = useState({ at: resetKey, status: IDLE });
  /** Beskrivningen som ritas just nu, som väntrutan visar. */
  const [drawing, setDrawing] = useState("");
  const status = stored.at === resetKey ? stored.status : IDLE;
  const working = status.kind === "working";
  const request = useRef<AbortController | null>(null);

  useEffect(() => {
    let alive = true;
    void shapeDrawingAvailable().then((value) => {
      if (alive) setAvailable(value);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Formen har bytts på annat håll, eller ritverktyget har stängts: resultatet ska inte läggas över det kunden valde sedan.
  useEffect(() => () => request.current?.abort(), [resetKey]);

  if (!available) return null;

  const draw = async () => {
    if (working) return;
    const description = cleanShapeDescription(text);
    if (description.length < 2) {
      setStored({ at: resetKey, status: { kind: "error", message: 'Beskriv formen med ett par ord, till exempel "en häst".' } });
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    setDrawing(description);
    setStored({ at: resetKey, status: { kind: "working" } });
    const result = await drawDescribedShape(description, controller.signal).catch(() => null);
    if (controller.signal.aborted) return;
    if (!result?.ok) {
      const message = result?.message ?? "Formen kunde inte ritas just nu. Försök igen om en stund.";
      setStored({ at: resetKey, status: { kind: "error", message } });
      return;
    }
    onOutline(result.outline);
    setStored({ at: resetKey, status: { kind: "done" } });
  };

  const cancel = () => {
    request.current?.abort();
    setStored({ at: resetKey, status: IDLE });
  };

  return (
    <div className={styles.describe} aria-busy={working}>
      {working && <DrawingDialog description={drawing} onCancel={cancel} />}
      <label htmlFor={inputId} className={styles.uploadTitle}>
        Beskriv formen
      </label>
      <div className={styles.describeRow}>
        <span className={`field ${styles.describeField}`}>
          <input
            id={inputId}
            type="text"
            value={text}
            maxLength={SHAPE_DESCRIPTION_MAX}
            placeholder="Till exempel en häst"
            autoComplete="off"
            enterKeyHint="go"
            disabled={working}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void draw();
              }
            }}
          />
        </span>
        <button type="button" className={`btn ${styles.describeButton}`} disabled={working} onClick={() => void draw()}>
          {working ? "Ritar…" : "Rita formen"}
        </button>
      </div>
      {status.kind === "idle" && (
        <p className={styles.note}>
          Vi ritar en form som liknar det du beskriver och passar som namnskylt. Sedan justerar du den genom att dra i punkterna.
        </p>
      )}
      {status.kind === "error" && (
        <p className={styles.uploadStatus} data-severity="error" role="alert">
          {status.message}
        </p>
      )}
      {status.kind === "done" && (
        <p className={styles.uploadStatus} role="status">
          Formen är ritad efter din beskrivning, i största tillåtna mått. Dra i punkterna för att justera den, ändra måttet eller
          öka hörnrundningen om kanterna ska bli mjukare. Blev den inte som du tänkt dig kan du rita en ny.
        </p>
      )}
    </div>
  );
}
