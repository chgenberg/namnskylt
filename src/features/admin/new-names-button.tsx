"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { BadgePreview } from "@/components/badge-preview";
import { priceOrder, type BadgeDocument } from "@/engine";
import { formatSek } from "@/features/orders/format";
import { staffBadges } from "@/lib/orders/repeat";
import type { ActionResult } from "./actions";
import styles from "./admin.module.css";

interface NewNamesButtonProps {
  /** Designen som återanvänds — orderns första skylt eller en sparad mall. */
  template: BadgeDocument;
  title: string;
  label: string;
  variant?: "primary" | "ghost";
  submit: (names: string, quantity: number) => Promise<ActionResult>;
}

/** Samma design med nya namn: en rad per person, som designerns "Fler namn". */
export function NewNamesButton({ template, title, label, variant = "ghost", submit }: NewNamesButtonProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [names, setNames] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const badges = useMemo(() => staffBadges(template, names, quantity), [template, names, quantity]);
  const preview = badges[0] ?? template;
  const price = priceOrder(badges);

  const send = () => {
    setError(null);
    startTransition(async () => {
      const result = await submit(names, quantity);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      dialog.current?.close();
      setNames("");
      if (result.orderNo) router.push(`/admin/ordrar/${result.orderNo}`);
    });
  };

  return (
    <>
      <button
        type="button"
        className={variant === "primary" ? styles.repeat : styles.ghostButton}
        onClick={() => dialog.current?.showModal()}
      >
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
          <path d="M8 3v10M3 8h10" />
        </svg>
        {label}
      </button>
      <dialog
        ref={dialog}
        className={styles.dialog}
        aria-label={title}
        onClick={(event) => {
          if (event.target === event.currentTarget) dialog.current?.close();
        }}
      >
        <div className={styles.dialogBody}>
          <p className={styles.eyebrow}>Samma design, nya namn</p>
          <h2 className={styles.dialogTitle}>{title}</h2>
          <div className={styles.dialogPreview}>
            <BadgePreview doc={preview} />
          </div>
          <label className={styles.formRow}>
            <span className={styles.formLabel}>En person per rad — namn, titel</span>
            <textarea
              className={styles.textarea}
              value={names}
              autoFocus
              placeholder={"Erik Holm, Kock\nSara Ek, Servitör"}
              onChange={(event) => setNames(event.target.value)}
            />
          </label>
          <label className={styles.formRow}>
            <span className={styles.formLabel}>Antal per namn</span>
            <input
              className={styles.input}
              type="number"
              min={1}
              max={1000}
              value={quantity}
              onChange={(event) => setQuantity(Math.max(1, Number(event.target.value) || 1))}
            />
          </label>
          <dl className={styles.summary}>
            <dt>Skyltar</dt>
            <dd>{badges.reduce((sum, b) => sum + b.quantity, 0)} st</dd>
            <dt className={styles.summaryTotal}>Totalt exkl. moms</dt>
            <dd className={styles.summaryTotal}>{formatSek(price.totalSek)}</dd>
          </dl>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          <div className={styles.dialogActions}>
            <button type="button" className="btn btn--ghost" onClick={() => dialog.current?.close()}>
              Avbryt
            </button>
            <button type="button" className="btn btn--primary" disabled={pending || badges.length === 0} onClick={send}>
              {pending ? "Lägger ordern…" : badges.length === 0 ? "Skriv minst ett namn" : `Beställ ${badges.length} namn`}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
