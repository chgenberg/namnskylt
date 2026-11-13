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
 * Sifferfält för ett mått i hela mm. Det kunden skriver ligger kvar orört medan
 * fältet har fokus — annars skulle "1" på väg mot "100" genast rättas till minsta
 * måttet. Ett tal inom gränserna gäller direkt; övriga rättas när fältet lämnas.
 */
export function MmField({ label, value, min, max, onCommit }: MmFieldProps) {
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
          value={draft ?? value}
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
