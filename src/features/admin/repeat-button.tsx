"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { BadgePreview } from "@/components/badge-preview";
import { priceOrder } from "@/engine";
import { formatSek } from "@/features/orders/format";
import { badgeCount, type StoredOrder } from "@/lib/orders/model";
import { repeatOrderAction } from "./actions";
import styles from "./admin.module.css";

interface RepeatButtonProps {
  order: StoredOrder;
  compact?: boolean;
}

/** "Beställ igen": samma skyltar, samma antal — bekräftas med pris innan den skickas. */
export function RepeatButton({ order, compact = false }: RepeatButtonProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const price = priceOrder(order.badges);
  const first = order.badges[0];

  const confirm = () => {
    setError(null);
    startTransition(async () => {
      const result = await repeatOrderAction(order.orderNo);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      dialog.current?.close();
      if (result.orderNo) router.push(`/admin/ordrar/${result.orderNo}`);
    });
  };

  return (
    <>
      <button
        type="button"
        className={styles.repeat}
        disabled={order.badges.length === 0}
        onClick={() => dialog.current?.showModal()}
      >
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M13.5 8A5.5 5.5 0 1 1 11.9 4.1M13.5 2.5v3h-3" />
        </svg>
        {compact ? "Igen" : "Beställ igen"}
      </button>
      <dialog
        ref={dialog}
        className={styles.dialog}
        aria-labelledby={`repeat-${order.orderNo}`}
        onClick={(event) => {
          if (event.target === event.currentTarget) dialog.current?.close();
        }}
      >
        <div className={styles.dialogBody}>
          <p className={styles.eyebrow}>Beställ igen</p>
          <h2 id={`repeat-${order.orderNo}`} className={styles.dialogTitle}>
            Samma order till {order.customer.company ?? order.customer.name}
          </h2>
          {first && (
            <div className={styles.dialogPreview}>
              <BadgePreview doc={first} />
            </div>
          )}
          <dl className={styles.summary}>
            <dt>Kopia av</dt>
            <dd className="mono">{order.orderNo}</dd>
            <dt>Namn</dt>
            <dd>{order.badges.length}</dd>
            <dt>Skyltar</dt>
            <dd>{badgeCount(order)} st</dd>
            <dt className={styles.summaryTotal}>Totalt exkl. moms</dt>
            <dd className={styles.summaryTotal}>{formatSek(price.totalSek)}</dd>
          </dl>
          <p className={styles.muted}>Ordern skickas direkt till tillverkningen med samma design och antal.</p>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          <div className={styles.dialogActions}>
            <button type="button" className="btn btn--ghost" onClick={() => dialog.current?.close()}>
              Avbryt
            </button>
            <button type="button" className="btn btn--primary" disabled={pending} onClick={confirm}>
              {pending ? "Lägger ordern…" : `Beställ · ${formatSek(price.totalInclVatSek)} inkl. moms`}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
