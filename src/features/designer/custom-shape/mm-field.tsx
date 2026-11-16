"use client";

import { useState } from "react";
import styles from "./custom-shape.module.css";

interface MmFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  /** Anropas med ett helt tal inom gränserna. */
  onCommit: (value: number) => void;
}

/**
 * Det kunden skriver ligger kvar orört medan fältet har fokus — annars skulle
 * "1" på väg mot "100" genast rättas till minsta måttet. Ett tal inom gränserna
 * gäller direkt; övriga rättas när fältet lämnas.
 */
function useMmDraft({ value, min, max, onCommit }: Omit<MmFieldProps, "label">) {
  const [draft, setDraft] = useState<string | null>(null);

  const type = (raw: string) => {
    setDraft(raw);
    const typed = Number(raw);
    if (raw.trim() !== "" && Number.isInteger(typed) && typed >= min && typed <= max) onCommit(typed);
  };

  const leave = () => {
    const typed = draft === null || draft.trim() === "" ? Number.NaN : Number(draft);
    if (Number.isFinite(typed)) onCommit(Math.min(max, Math.max(min, Math.round(typed))));
    setDraft(null);
  };

  return { shown: draft ?? value, type, leave };
}

interface DimensionFieldProps extends MmFieldProps {
  /** Var måttet står på ritytan: ovanför skylten eller till vänster om den. */
  side: "top" | "left";
}

/**
 * Måttet som står vid ritytan, skrivbart på plats (besked via ägaren 2026-11-16).
 * Det sätter just den sidan, oavsett låset för proportionerna i fälten under ritytan:
 * den som skriver ett mått här vill ha exakt det måttet.
 */
export function DimensionField({ side, label, value, min, max, onCommit }: DimensionFieldProps) {
  const { shown, type, leave } = useMmDraft({ value, min, max, onCommit });
  // Ritytan fångar pekaren för att dra i punkterna: ett tryck i fältet ska bara ge fältet fokus.
  const keep = (event: { stopPropagation: () => void }) => event.stopPropagation();
  return (
    <label className={`mono ${styles.dimension}`} data-side={side} onPointerDown={keep} onMouseDown={keep} title={`Ändra ${label.toLowerCase()}`}>
      <input
        type="number"
        inputMode="numeric"
        aria-label={`${label} i mm`}
        min={min}
        max={max}
        step={1}
        value={shown}
        onChange={(event) => type(event.target.value)}
        onBlur={leave}
        onKeyDown={(event) => {
          // Piltangenterna hör till fältet här, inte till ritytans punkter.
          event.stopPropagation();
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
      <span aria-hidden="true">mm</span>
    </label>
  );
}

/** Sifferfält för ett mått i hela mm, med etikett. Se `useMmDraft` för hur det som skrivs hanteras. */
export function MmField({ label, value, min, max, onCommit }: MmFieldProps) {
  const { shown, type, leave } = useMmDraft({ value, min, max, onCommit });

  return (
    <label className={styles.mmField}>
      <span className={styles.fieldLabel}>{label}</span>
      <span className="field">
        <input
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          step={1}
          value={shown}
          onChange={(event) => type(event.target.value)}
          onBlur={leave}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
        />
        <span className={`mono ${styles.unit}`} aria-hidden="true">
          mm
        </span>
      </span>
    </label>
  );
}
