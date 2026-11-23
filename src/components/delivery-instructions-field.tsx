"use client";

import { useId } from "react";
import { formatSek } from "@/lib/format";
import { DELIVERY_INSTRUCTIONS_MAX } from "@/lib/orders/delivery";
import styles from "./delivery-fields.module.css";

interface DeliveryInstructionsFieldProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  /** Frakten för varje extra leveransadress, när den är känd. Står i hjälptexten. */
  extraDeliverySek?: number | null;
}

/**
 * Leveransspecifikationen: kundens fritext om hur skyltarna ska skickas (beslut av ägaren
 * 2026-11-23). En order på hundra namn kan behöva gå till flera ställen, också till samma kund:
 * här skrivs vilka namn som ska vart, och verkstaden delar upp ordern i leveranser efter det.
 * Samma fält i kassan, i återförsäljarens beställning, när en offert godkänns och i panelen.
 */
export function DeliveryInstructionsField({ value, onChange, disabled, extraDeliverySek }: DeliveryInstructionsFieldProps) {
  const id = useId();
  const extra = extraDeliverySek != null && extraDeliverySek > 0 ? `, och varje extra adress kostar ${formatSek(extraDeliverySek)} i frakt` : "";
  return (
    <div className={styles.instructions}>
      <label htmlFor={id} className={styles.label}>
        Leveransspecifikation (valfritt)
      </label>
      <textarea
        id={id}
        className={styles.textarea}
        rows={3}
        maxLength={DELIVERY_INSTRUCTIONS_MAX}
        value={value}
        disabled={disabled}
        placeholder="Till exempel: Anna Lind och Erik Berg till kontoret i Göteborg, övriga till Storgatan 1, 111 22 Stockholm."
        onChange={(event) => onChange(event.target.value)}
        aria-describedby={`${id}-hint`}
        data-delivery-instructions
      />
      <p id={`${id}-hint`} className={styles.hint}>
        Ska skyltarna till flera ställen? Skriv vilka namn som ska vart, med adresserna. Tillverkningen delar upp ordern
        {extra}.
      </p>
    </div>
  );
}
