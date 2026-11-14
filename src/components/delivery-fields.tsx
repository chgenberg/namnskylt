"use client";

import { useId } from "react";
import type { DeliveryDraft } from "@/lib/orders/delivery";
import styles from "./delivery-fields.module.css";

interface DeliveryFieldsProps {
  value: DeliveryDraft;
  onChange: (value: DeliveryDraft) => void;
  disabled?: boolean;
  /** Fälten som måste fyllas i märks ut och krävs av webbläsaren. Av när adressen får lämnas tom. */
  required?: boolean;
}

/** Leveransadressens fält, samma överallt: mottagare, kontakt, adress, postnummer, ort och telefon. */
export function DeliveryFields({ value, onChange, disabled, required = true }: DeliveryFieldsProps) {
  const id = useId();
  const field = (key: keyof DeliveryDraft, label: string, options: { wide?: boolean; must?: boolean; autoComplete?: string; inputMode?: "numeric" | "tel" } = {}) => (
    <div className={styles.row} data-wide={options.wide || undefined}>
      <label htmlFor={`${id}-${key}`} className={styles.label}>
        {label}
        {options.must && required && <span aria-hidden="true"> *</span>}
      </label>
      <span className="field">
        <input
          id={`${id}-${key}`}
          value={value[key]}
          disabled={disabled}
          required={options.must && required}
          autoComplete={options.autoComplete}
          inputMode={options.inputMode}
          maxLength={120}
          onChange={(event) => onChange({ ...value, [key]: event.target.value })}
        />
      </span>
    </div>
  );
  return (
    <div className={styles.grid}>
      {field("name", "Mottagare, företag eller namn", { wide: true, must: true, autoComplete: "organization" })}
      {field("contactName", "Att, kontaktperson", { autoComplete: "name" })}
      {field("phone", "Telefon", { autoComplete: "tel", inputMode: "tel" })}
      {field("line1", "Gatuadress", { wide: true, must: true, autoComplete: "address-line1" })}
      {field("line2", "c/o, våning eller port", { wide: true, autoComplete: "address-line2" })}
      {field("zip", "Postnummer", { must: true, autoComplete: "postal-code", inputMode: "numeric" })}
      {field("city", "Ort", { must: true, autoComplete: "address-level2" })}
    </div>
  );
}
