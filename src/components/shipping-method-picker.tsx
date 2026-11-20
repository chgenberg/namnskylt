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
  /** Paketets belopp, när paket går att välja i stället för varubrevet. */
  parcelSek?: number | null;
  disabled?: boolean;
}

/** Vad fraktsättet kostar, som text bredvid valet. */
function costLabel(method: ShippingMethod, standardSek: number | null | undefined, parcelSek: number | null | undefined): string | null {
  if (method === "pickup") return formatSek(0);
  if (method === "express") return "Pris tillkommer";
  const sek = method === "parcel" ? parcelSek : standardSek;
  return typeof sek === "number" ? formatSek(sek) : null;
}

/** Bredvid paketet är standardfrakten ett varubrev, och då heter den så. */
const LETTER = { label: "Varubrev, PostNord", info: "Spårbart varubrev med PostNord. Det billigaste sättet för en liten order." } as const;

/**
 * Leveranssättet i kassan, samma val som i Skylt & Gravyrtekniks egen kassa:
 * standardfrakt, express eller upphämtning. Går en liten order som varubrev kan
 * den som beställer välja paket i stället (beslut av ägaren 2026-11-20): då
 * står varubrevet förvalt och paketet bredvid. Frakten väljs här och ligger
 * aldrig i priset per skylt.
 */
export function ShippingMethodPicker({ value, onChange, methods, standardSek, parcelSek, disabled = false }: ShippingMethodPickerProps) {
  const name = useId();
  // Varubrev heter standardfrakten bara där paketets pris är känt: då är den ett varubrev.
  const besideParcel = methods.includes("parcel") && typeof parcelSek === "number";
  return (
    <div className={styles.list} role="radiogroup" aria-label="Leveranssätt">
      {methods.map((method) => {
        const cost = costLabel(method, standardSek, parcelSek);
        const letter = method === "standard" && besideParcel;
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
                <span>{letter ? LETTER.label : SHIPPING_METHOD_LABEL[method]}</span>
                {cost && <span className={styles.cost}>{cost}</span>}
              </span>
              <span className={styles.info}>{letter ? LETTER.info : SHIPPING_METHOD_INFO[method]}</span>
            </span>
          </label>
        );
      })}
    </div>
  );
}
