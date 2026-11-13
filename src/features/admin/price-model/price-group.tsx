"use client";

import { MAX_PRICE_SEK, partShare, type PriceModel } from "@/engine/price-model";
import { formatSek, formatSekExact } from "@/lib/format";
import { NumberField } from "./number-field";
import styles from "../price-model.module.css";

interface PriceGroupProps {
  name: string;
  note: string;
  /** Återförsäljarens pris på varje trappsteg. */
  prices: readonly number[];
  /** Skyltar har ett pris per trappsteg; fästen och tillval har ett pris som gäller alla. */
  perTier: boolean;
  model: PriceModel;
  tierLabels: readonly string[];
  onChange: (tierIndex: number, value: number) => void;
}

/**
 * Raderna för en sak med pris: det återförsäljaren betalar, och under det vad
 * som går till verkstaden, vad som blir provision och vad slutkunden betalar.
 */
export function PriceGroup({ name, note, prices, perTier, model, tierLabels, onChange }: PriceGroupProps) {
  const shares = prices.map((price, i) => partShare(model, price, i));
  return (
    <>
      <span className={styles.divider} />
      <span className={styles.rowLabel}>
        {name}
        <small>{note}</small>
      </span>
      {prices.map((price, i) =>
        perTier || i === 0 ? (
          <NumberField
            key={i}
            label={perTier ? `${name}, ${tierLabels[i] ?? ""}` : `${name}, alla trappsteg`}
            value={price}
            unit="kr"
            max={MAX_PRICE_SEK}
            onChange={(value) => onChange(i, value)}
          />
        ) : (
          <span key={i} className={styles.same}>
            {formatSek(price)}
          </span>
        ),
      )}
      <span className={styles.derivedLabel}>Skylt &amp; Gravyr netto</span>
      {shares.map((share, i) => (
        <span key={i} className={styles.derived}>
          {formatSekExact(share.supplierSek)}
        </span>
      ))}
      <span className={styles.derivedLabel}>Merchin provision</span>
      {shares.map((share, i) => (
        <span key={i} className={styles.derived}>
          {formatSekExact(share.provisionSek)}
        </span>
      ))}
      <span className={styles.derivedLabel}>Slutkund</span>
      {shares.map((share, i) => (
        <span key={i} className={styles.derived}>
          {formatSek(share.endSek)}
        </span>
      ))}
    </>
  );
}
