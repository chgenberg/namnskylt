"use client";

import { useMemo, useState, useTransition } from "react";
import { engravedRows, type BadgeDocument } from "@/engine";
import { formatSek } from "@/features/orders/format";
import {
  discountForUnits,
  MAX_DISCOUNT_PERCENT,
  MAX_EXTRAS,
  MAX_UNIT_SEK,
  NO_PRICING,
  priceWithPricing,
  unitsForDiscount,
  type Pricing,
} from "@/lib/orders/pricing";
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

interface ExtraDraft {
  label: string;
  amount: string;
}

function parseSek(text: string): number | null {
  const value = Number(text.replace(/\s/g, "").replace(",", "."));
  return text.trim() === "" || !Number.isFinite(value) ? null : Math.min(MAX_UNIT_SEK, Math.max(0, Math.round(value)));
}

function parsePercent(text: string): number {
  const value = Number(text.replace(",", "."));
  return Number.isFinite(value) ? Math.min(MAX_DISCOUNT_PERCENT, Math.max(0, value)) : 0;
}

const formatPercent = (value: number) => String(Math.round(value * 10) / 10).replace(".", ",");

/**
 * À-pris per skylt och rabatt hänger ihop: ändras ett à-pris visar rabatten hur
 * långt under listpris skyltarna ligger, och en ny rabatt räknar om à-priserna.
 * Extra kostnader läggs till efter rabatten.
 */
export function PricingEditor({ badges, pricing, submit, purchase }: PricingEditorProps) {
  const base = useMemo(() => priceWithPricing(badges), [badges]);
  const list = useMemo(() => base.lines.map((l) => l.listUnitSek), [base]);
  const quantities = useMemo(() => base.lines.map((l) => l.quantity), [base]);
  const saved = priceWithPricing(badges, pricing);
  // Äldre priser kan ha rabatten separat — här blir den en del av à-priserna.
  const savedUnits = saved.lines.map((l) => Math.round(l.unitSek * (1 - saved.discountPercent / 100)));

  const [units, setUnits] = useState<string[]>(() => savedUnits.map(String));
  const [discount, setDiscount] = useState(() => formatPercent(discountForUnits(list, savedUnits, quantities)));
  const [extras, setExtras] = useState<ExtraDraft[]>(() =>
    (pricing?.extras ?? []).map((e) => ({ label: e.label, amount: String(e.amountSek) })),
  );
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const unitValues = units.map((u, i) => parseSek(u) ?? list[i] ?? 0);
  const draft: Pricing = {
    unitOverrides: unitValues.map((value, i) => (value === list[i] ? null : value)),
    discountPercent: 0,
    extras: extras.flatMap((e) => {
      const amountSek = parseSek(e.amount);
      return e.label.trim() && amountSek !== null ? [{ label: e.label.trim().slice(0, 80), amountSek }] : [];
    }),
  };
  const priced = priceWithPricing(badges, draft);
  const dirty =
    JSON.stringify(draft) !==
    JSON.stringify({
      unitOverrides: savedUnits.map((value, i) => (value === list[i] ? null : value)),
      discountPercent: 0,
      extras: pricing?.extras ?? [],
    });
  const cost = purchase ? purchasePrice(badges, purchase) : null;
  const margin = cost ? marginOf(priced.totalSek, cost.totalSek) : null;

  const changeUnit = (index: number, text: string) => {
    const next = units.map((u, j) => (j === index ? text : u));
    setUnits(next);
    setDiscount(formatPercent(discountForUnits(list, next.map((u, i) => parseSek(u) ?? list[i] ?? 0), quantities)));
  };

  const changeDiscount = (text: string) => {
    setDiscount(text);
    setUnits(unitsForDiscount(list, parsePercent(text)).map(String));
  };

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
    setExtras([]);
    save(NO_PRICING);
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
                    <input inputMode="numeric" value={units[i] ?? ""} onChange={(e) => changeUnit(i, e.target.value)} />
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

      <div className={styles.extras}>
        <p className={styles.formLabel}>Extra kostnader</p>
        {extras.map((extra, i) => (
          <div key={i} className={styles.extraRow}>
            <input
              className={styles.input}
              value={extra.label}
              maxLength={80}
              disabled={!submit}
              placeholder="Framtagning av korrektur"
              aria-label={`Extra kostnad ${i + 1}, beskrivning`}
              onChange={(e) => setExtras((all) => all.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
            />
            <label className={styles.priceInput}>
              <span className="visually-hidden">Belopp för extra kostnad {i + 1}</span>
              <input
                inputMode="numeric"
                value={extra.amount}
                disabled={!submit}
                placeholder="0"
                onChange={(e) => setExtras((all) => all.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))}
              />
              <span>kr</span>
            </label>
            {submit && (
              <button
                type="button"
                className={styles.iconDanger}
                aria-label={`Ta bort ${extra.label || "extra kostnad"}`}
                onClick={() => setExtras((all) => all.filter((_, j) => j !== i))}
              >
                ×
              </button>
            )}
          </div>
        ))}
        {submit && extras.length < MAX_EXTRAS && (
          <button
            type="button"
            className={styles.addExtra}
            onClick={() => setExtras((all) => [...all, { label: "", amount: "" }])}
          >
            + Lägg till extra kostnad
          </button>
        )}
        {!submit && extras.length === 0 && <span className={styles.muted}>Inga</span>}
      </div>

      <div className={styles.priceFoot}>
        {submit ? (
          <label className={styles.discountField}>
            <span className={styles.formLabel}>Rabatt på skyltarna</span>
            <span className={styles.priceInput}>
              <input inputMode="decimal" value={discount} onChange={(e) => changeDiscount(e.target.value)} aria-label="Rabatt i procent" />
              <span>%</span>
            </span>
            <span className={styles.muted}>Följer à-priserna — ändra här så räknas de om.</span>
          </label>
        ) : (
          <span />
        )}
        <dl className={styles.summary}>
          {priced.savingsSek > 0 && (
            <>
              <dt className={styles.muted}>Skyltar till listpris</dt>
              <dd className={styles.muted}>{formatSek(priced.listTotalSek)}</dd>
              <dt className={styles.discountText}>Rabatt {formatPercent(priced.savingsPercent)} %</dt>
              <dd className={styles.discountText}>−{formatSek(priced.savingsSek)}</dd>
            </>
          )}
          <dt>Skyltar</dt>
          <dd>{formatSek(priced.badgesSek)}</dd>
          {priced.extras.map((extra, i) => (
            <span key={i} style={{ display: "contents" }}>
              <dt>{extra.label}</dt>
              <dd>{formatSek(extra.amountSek)}</dd>
            </span>
          ))}
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
