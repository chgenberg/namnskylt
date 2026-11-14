"use client";

import { MAX_PRICE_SEK, partShare, provisionPercentRange, type PriceModel } from "@/engine/price-model";
import { formatSek, formatSekExact } from "@/lib/format";
import { NumberField } from "./number-field";
import styles from "../price-model.module.css";

interface PriceGroupProps {
  name: string;
  note: string;
  /** Återförsäljarens pris på varje trappsteg. */
  prices: readonly number[];
  model: PriceModel;
  tierLabels: readonly string[];
  onChange: (tierIndex: number, value: number) => void;
}

/** Ett belopp med ören, eller lägsta och högsta när de skiljer sig: `57,80–59,16 kr`. */
function rangeText(a: number, b: number): string {
  const low = Math.min(a, b);
  const high = Math.max(a, b);
  return low === high ? formatSekExact(high) : `${formatSekExact(low).replace(" kr", "")}–${formatSekExact(high)}`;
}

/**
 * Raderna för en sak med pris: det återförsäljaren betalar, och under det vad
 * som går till verkstaden, vad som blir provision och vad slutkunden betalar.
 * Provisionen räknas steg för steg, så på ett trappsteg skiljer den mellan
 * stegets första och sista antal. Då visas båda beloppen.
 */
export function PriceGroup({ name, note, prices, model, tierLabels, onChange }: PriceGroupProps) {
  const shares = prices.map((price, i) => {
    const { min, max } = provisionPercentRange(model, i);
    return { low: partShare(model, price, min), high: partShare(model, price, max) };
  });
  return (
    <>
      <span className={styles.divider} />
      <span className={styles.rowLabel}>
        {name}
        <small>{note}</small>
      </span>
      {prices.map((price, i) => (
        <NumberField
          key={i}
          label={`${name}, ${tierLabels[i] ?? ""}`}
          value={price}
          unit="kr"
          max={MAX_PRICE_SEK}
          decimals
          onChange={(value) => onChange(i, value)}
        />
      ))}
      <span className={styles.derivedLabel}>Skylt &amp; Gravyr netto</span>
      {shares.map((share, i) => (
        <span key={i} className={styles.derived}>
          {rangeText(share.low.supplierSek, share.high.supplierSek)}
        </span>
      ))}
      <span className={styles.derivedLabel}>Merchin provision</span>
      {shares.map((share, i) => (
        <span key={i} className={styles.derived}>
          {rangeText(share.low.provisionSek, share.high.provisionSek)}
        </span>
      ))}
      <span className={styles.derivedLabel}>Slutkund</span>
      {shares.map((share, i) => (
        <span key={i} className={styles.derived}>
          {formatSek(share.high.endSek)}
        </span>
      ))}
    </>
  );
}
