"use client";

import { useMemo, useState, useTransition } from "react";
import { engravedRows, type BadgeDocument } from "@/engine";
import { formatSek } from "@/features/orders/format";
import { MAX_DISCOUNT_PERCENT, MAX_UNIT_SEK, priceWithPricing, type Pricing } from "@/lib/orders/pricing";
import { marginOf, purchasePrice, type PurchaseTerms } from "@/lib/orders/purchase";
import type { ActionResult } from "./actions";
import styles from "./admin.module.css";

interface PricingEditorProps {
  badges: readonly BadgeDocument[];
  pricing: Pricing | null;
  /** Utan `submit` visas priserna bara. */
  submit?: (pricing: Pricing) => Promise<ActionResult>;
  /** Visar inköp och marginal när villkoren är inställda. */
  purchase?: PurchaseTerms | null;
}

function parseSek(text: string): number | null {
  const value = Number(text.replace(/\s/g, "").replace(",", "."));
  return text.trim() === "" || !Number.isFinite(value) ? null : Math.min(MAX_UNIT_SEK, Math.max(0, Math.round(value)));
}

/** À-pris per skylt och rabatt på summan — totalerna räknas live innan de sparas. */
export function PricingEditor({ badges, pricing, submit, purchase }: PricingEditorProps) {
  const list = useMemo(() => priceWithPricing(badges).lines.map((l) => l.listUnitSek), [badges]);
  const [units, setUnits] = useState<string[]>(() => badges.map((_, i) => String(pricing?.unitOverrides[i] ?? list[i] ?? "")));
  const [discount, setDiscount] = useState(String(pricing?.discountPercent ?? 0));
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const draft: Pricing = {
    unitOverrides: units.map((u, i) => {
      const value = parseSek(u);
      return value === null || value === list[i] ? null : value;
    }),
    discountPercent: Math.min(MAX_DISCOUNT_PERCENT, Math.max(0, Number(discount.replace(",", ".")) || 0)),
  };
  const priced = priceWithPricing(badges, draft);
  const saved = priceWithPricing(badges, pricing);
  const cost = purchase ? purchasePrice(badges, purchase) : null;
  const margin = cost ? marginOf(priced.totalSek, cost.totalSek) : null;
  const dirty = priced.totalSek !== saved.totalSek || JSON.stringify(draft.unitOverrides) !== JSON.stringify(badges.map((_, i) => pricing?.unitOverrides[i] ?? null));

  const save = (next: Pricing) => {
    if (!submit) return;
    setMessage(null);
    startTransition(async () => {
      const result = await submit(next);
      setMessage(result.ok ? { ok: true, text: "Priserna är sparade" } : { ok: false, text: result.error });
    });
  };

  const reset = () => {
    setUnits(list.map(String));
    setDiscount("0");
    save({ unitOverrides: [], discountPercent: 0 });
  };

  return (
    <div className={styles.form}>
      <div className={styles.priceTable} role="table" aria-label="Priser per skylt">
        <div className={styles.priceHead} role="row">
          <span role="columnheader">Skylt</span>
          <span role="columnheader">Antal</span>
          <span role="columnheader">À-pris</span>
          <span role="columnheader" className={styles.num}>
            Summa
          </span>
        </div>
        {badges.map((badge, i) => {
          const line = priced.lines[i];
          const name = engravedRows(badge)[0]?.text.trim() || "Utan namn";
          return (
            <div key={i} className={styles.priceRow} role="row">
              <span role="cell" className={styles.rowTitle}>
                <strong>{name}</strong>
                {(line?.overridden || cost) && (
                  <span className={styles.muted}>
                    {[
                      line?.overridden ? `listpris ${formatSek(line.listUnitSek)}` : null,
                      cost ? `inköp ${formatSek(cost.unitSek[i] ?? 0)}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                )}
              </span>
              <span role="cell" className="mono">
                {badge.quantity} st
              </span>
              <span role="cell">
                {submit ? (
                  <label className={styles.priceInput}>
                    <span className="visually-hidden">À-pris för {name}</span>
                    <input inputMode="numeric" value={units[i] ?? ""} onChange={(e) => setUnits((all) => all.map((u, j) => (j === i ? e.target.value : u)))} />
                    <span>kr</span>
                  </label>
                ) : (
                  <span className="mono">{formatSek(line?.unitSek ?? 0)}</span>
                )}
              </span>
              <span role="cell" className={`${styles.num} mono`}>
                {formatSek(line?.totalSek ?? 0)}
              </span>
            </div>
          );
        })}
      </div>

      <div className={styles.priceFoot}>
        {submit ? (
          <label className={styles.discountField}>
            <span className={styles.formLabel}>Rabatt på hela ordern</span>
            <span className={styles.priceInput}>
              <input inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} aria-label="Rabatt i procent" />
              <span>%</span>
            </span>
          </label>
        ) : (
          <span />
        )}
        <dl className={styles.summary}>
          <dt>Delsumma</dt>
          <dd>{formatSek(priced.subtotalSek)}</dd>
          {priced.discountSek > 0 && (
            <>
              <dt className={styles.discountText}>Rabatt {priced.discountPercent} %</dt>
              <dd className={styles.discountText}>−{formatSek(priced.discountSek)}</dd>
            </>
          )}
          <dt className={styles.summaryTotal}>Totalt exkl. moms</dt>
          <dd className={styles.summaryTotal}>{formatSek(priced.totalSek)}</dd>
          <dt>Inkl. moms</dt>
          <dd>{formatSek(priced.totalInclVatSek)}</dd>
          {cost && margin && (
            <>
              <dt>Ditt inköp</dt>
              <dd>{formatSek(cost.totalSek)}</dd>
              <dt className={margin.sek < 0 ? styles.marginBad : styles.marginGood}>Marginal</dt>
              <dd className={margin.sek < 0 ? styles.marginBad : styles.marginGood}>
                {formatSek(margin.sek)}
                {margin.percent !== null && ` · ${margin.percent} %`}
              </dd>
            </>
          )}
          {priced.totalSek !== priced.listTotalSek && (
            <>
              <dt className={styles.muted}>Listpris</dt>
              <dd className={styles.muted}>{formatSek(priced.listTotalSek)}</dd>
            </>
          )}
        </dl>
      </div>

      {submit && (
        <div className={styles.actionBar}>
          <button type="button" className="btn btn--primary" disabled={pending || !dirty} onClick={() => save(draft)}>
            {pending ? "Sparar…" : "Spara priser"}
          </button>
          {(pricing || dirty) && (
            <button type="button" className="btn btn--ghost" disabled={pending} onClick={reset}>
              Återställ listpris
            </button>
          )}
          {message && (
            <span className={message.ok ? styles.success : styles.error} role="status">
              {message.text}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
