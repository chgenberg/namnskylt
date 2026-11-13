"use client";

import type { ItemBreakdown, PartShare, PricePart } from "@/engine/price-model";
import { formatSek, formatSekExact } from "@/lib/format";
import styles from "../price-model.module.css";

interface ShareTableProps {
  spec: ItemBreakdown;
  /** Radernas namn: skylten, fästet och tillvalen som de är valda i kalkylen. */
  partNames: Record<PricePart, string>;
  quantity: number;
  /** Orderns summor i hela kronor, som de faktureras. */
  totals: PartShare;
}

const marginOf = (share: PartShare) => share.endSek - share.resellerSek;

/**
 * Specifikationen per skylt: vad varje part får för skylten, fästet och varje
 * tillval, och sist minidebiteringen och hela ordern.
 */
export function ShareTable({ spec, partNames, quantity, totals }: ShareTableProps) {
  const hasMinimum = spec.minimum.resellerSek > 0 || spec.minimum.endSek > 0;
  return (
    <div className={styles.scroll}>
      <table className={styles.shares}>
        <thead>
          <tr>
            <th scope="col">Per skylt</th>
            <th scope="col">ÅF betalar</th>
            <th scope="col" data-own="true">
              Skylt &amp; Gravyr netto
            </th>
            <th scope="col">Merchin provision</th>
            <th scope="col">Slutkund</th>
            <th scope="col">ÅF:s marginal</th>
          </tr>
        </thead>
        <tbody>
          {spec.parts.map(({ part, share }) => (
            <tr key={part}>
              <th scope="row">{partNames[part]}</th>
              <td>{formatSek(share.resellerSek)}</td>
              <td data-own="true">{formatSekExact(share.supplierSek)}</td>
              <td>{formatSekExact(share.provisionSek)}</td>
              <td>{formatSek(share.endSek)}</td>
              <td>{formatSek(marginOf(share))}</td>
            </tr>
          ))}
          <tr className={styles.sum}>
            <th scope="row">Summa per skylt</th>
            <td>{formatSek(spec.perSign.resellerSek)}</td>
            <td data-own="true">{formatSekExact(spec.perSign.supplierSek)}</td>
            <td>{formatSekExact(spec.perSign.provisionSek)}</td>
            <td>{formatSek(spec.perSign.endSek)}</td>
            <td>{formatSek(marginOf(spec.perSign))}</td>
          </tr>
        </tbody>
        <tbody>
          <tr>
            <th scope="row">
              Minidebitering
              <small>{hasMinimum ? "Påslag upp till minsta ordervärde, per order" : "Ordern når minsta ordervärde"}</small>
            </th>
            <td>{formatSek(spec.minimum.resellerSek)}</td>
            <td data-own="true">{formatSekExact(spec.minimum.supplierSek)}</td>
            <td>{formatSekExact(spec.minimum.provisionSek)}</td>
            <td>{formatSek(spec.minimum.endSek)}</td>
            <td>{formatSek(marginOf(spec.minimum))}</td>
          </tr>
          <tr className={styles.total}>
            <th scope="row">
              Hela ordern
              <small>{quantity} st</small>
            </th>
            <td>{formatSek(totals.resellerSek)}</td>
            <td data-own="true">{formatSek(totals.supplierSek)}</td>
            <td>{formatSek(totals.provisionSek)}</td>
            <td>{formatSek(totals.endSek)}</td>
            <td>{formatSek(marginOf(totals))}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
