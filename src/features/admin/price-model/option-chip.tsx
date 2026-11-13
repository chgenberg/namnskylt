"use client";

import styles from "../price-model.module.css";

interface OptionChipProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

/** Ett tillval som slås av och på. En kryssruta under ytan, lika hög som fälten bredvid. */
export function OptionChip({ label, checked, onChange }: OptionChipProps) {
  return (
    <label className={styles.chip}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className={styles.chipMark} aria-hidden="true">
        <svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2.5 6.2 5 8.6l4.5-5.2" />
        </svg>
      </span>
      <span>{label}</span>
    </label>
  );
}
