"use client";

import styles from "../price-model.module.css";

interface NumberFieldProps {
  /** Läses upp av skärmläsare; den synliga rubriken står i tabellen eller ovanför fältet. */
  label: string;
  value: number;
  unit: string;
  max: number;
  /** Kronor och antal är heltal; procent får ha decimaler. */
  decimals?: boolean;
  onChange: (value: number) => void;
}

export function NumberField({ label, value, unit, max, decimals = false, onChange }: NumberFieldProps) {
  return (
    <label className={styles.field}>
      <span className="visually-hidden">{label}</span>
      <input
        type="number"
        inputMode={decimals ? "decimal" : "numeric"}
        min={0}
        max={max}
        step={decimals ? 0.5 : 1}
        value={value}
        onChange={(event) => {
          const next = Number(event.target.value);
          const clamped = Number.isFinite(next) ? Math.min(max, Math.max(0, next)) : 0;
          onChange(decimals ? clamped : Math.round(clamped));
        }}
      />
      <span aria-hidden="true">{unit}</span>
    </label>
  );
}
