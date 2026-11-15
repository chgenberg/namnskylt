"use client";

import { useId } from "react";
import type { ShippingMethod } from "@/engine";
import { formatSek } from "@/lib/format";
import { SHIPPING_METHOD_INFO, SHIPPING_METHOD_LABEL } from "@/lib/orders/delivery";
import styles from "./shipping-method-picker.module.css";

interface ShippingMethodPickerProps {
  value: ShippingMethod;
  onChange: (method: ShippingMethod) => void;
  /** Valen som erbjuds, i den ordning de visas. */
  methods: readonly ShippingMethod[];
  /** Standardfraktens belopp när det är känt. Utelämnas där beloppet inte visas. */
  standardSek?: number | null;
  disabled?: boolean;
}

/** Vad fraktsättet kostar, som text bredvid valet. */
function costLabel(method: ShippingMethod, standardSek: number | null | undefined): string | null {
  if (method === "pickup") return formatSek(0);
  if (method === "express") return "Pris tillkommer";
  return typeof standardSek === "number" ? formatSek(standardSek) : null;
}

/**
 * Leveranssättet i kassan, samma val som i Skylt & Gravyrtekniks egen kassa:
 * standardfrakt, express eller upphämtning. Frakten väljs här och ligger aldrig
 * i priset per skylt.
 */
export function ShippingMethodPicker({ value, onChange, methods, standardSek, disabled = false }: ShippingMethodPickerProps) {
  const name = useId();
  return (
    <div className={styles.list} role="radiogroup" aria-label="Leveranssätt">
      {methods.map((method) => {
        const cost = costLabel(method, standardSek);
        return (
          <label key={method} className={styles.option} data-checked={method === value || undefined}>
            <input
              type="radio"
              name={name}
              value={method}
              checked={method === value}
              disabled={disabled}
              onChange={() => onChange(method)}
            />
            <span className={styles.text}>
              <span className={styles.head}>
                <span>{SHIPPING_METHOD_LABEL[method]}</span>
                {cost && <span className={styles.cost}>{cost}</span>}
              </span>
              <span className={styles.info}>{SHIPPING_METHOD_INFO[method]}</span>
            </span>
          </label>
        );
      })}
    </div>
  );
}
