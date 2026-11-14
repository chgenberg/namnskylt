"use client";

import { useState } from "react";
import styles from "../price-model.module.css";

interface NumberFieldProps {
  /** Läses upp av skärmläsare; den synliga rubriken står i tabellen eller ovanför fältet. */
  label: string;
  value: number;
  unit: string;
  max: number;
  /** Antal är heltal; kronor och procent får ha upp till två decimaler. */
  decimals?: boolean;
  onChange: (value: number) => void;
}

const WHOLE = /^\d*$/;
const DECIMAL = /^\d*(?:[.,]\d{0,2})?$/;

const twoDecimals = (value: number) => Math.round(value * 100) / 100;

/** Talet som det står i fältet, med decimalkomma. Kronor med ören visas med två decimaler. */
function fieldText(value: number, unit: string): string {
  if (Number.isInteger(value)) return String(value);
  return (unit === "kr" ? value.toFixed(2) : String(twoDecimals(value))).replace(".", ",");
}

/**
 * Ett tal i prismodellen. Fältet är ett textfält, så att decimaler går att
 * skriva med både komma och punkt och ett halvfärdigt tal som `72,` inte
 * nollställs medan man skriver.
 */
export function NumberField({ label, value, unit, max, decimals = false, onChange }: NumberFieldProps) {
  /** Texten medan fältet redigeras; `null` när fältet visar modellens värde. */
  const [draft, setDraft] = useState<string | null>(null);
  const clamp = (next: number) => Math.min(max, Math.max(0, next));
  return (
    <label className={styles.field}>
      <span className="visually-hidden">{label}</span>
      <input
        type="text"
        inputMode={decimals ? "decimal" : "numeric"}
        autoComplete="off"
        value={draft ?? fieldText(value, unit)}
        onChange={(event) => {
          const text = event.target.value.replace(/\s/g, "");
          if (!(decimals ? DECIMAL : WHOLE).test(text)) return;
          setDraft(text);
          const next = Number(text.replace(",", "."));
          onChange(Number.isFinite(next) ? clamp(next) : 0);
        }}
        onKeyDown={(event) => {
          if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
          event.preventDefault();
          setDraft(null);
          onChange(clamp(twoDecimals(value + (event.key === "ArrowUp" ? 1 : -1))));
        }}
        onBlur={() => setDraft(null)}
      />
      <span aria-hidden="true">{unit}</span>
    </label>
  );
}
