"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition } from "react";
import { formatSek } from "@/features/orders/format";
import { deleteOrderAction } from "./actions";
import styles from "./admin.module.css";

interface DeleteOrderButtonProps {
  orderNo: string;
  customerName: string;
  badgeCount: number;
  totalSek: number;
  /** Leverantörens ordernummer när ordern redan ligger hos tryckeriet och inte är klar. */
  atPrinter: string | null;
  compact?: boolean;
  /** Vart sidan går efteråt — detaljsidan finns ju inte längre. */
  redirectTo?: string;
}

export function DeleteOrderButton({
  orderNo,
  customerName,
  badgeCount,
  totalSek,
  atPrinter,
  compact = false,
  redirectTo,
}: DeleteOrderButtonProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const router = useRouter();
  const [understood, setUnderstood] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const open = () => {
    setError(null);
    setUnderstood(false);
    dialog.current?.showModal();
  };

  const confirm = () => {
    setError(null);
    startTransition(async () => {
      const result = await deleteOrderAction(orderNo);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      dialog.current?.close();
      if (redirectTo) router.replace(redirectTo);
    });
  };

  return (
    <>
      <button
        type="button"
        className={compact ? styles.iconDanger : styles.dangerGhost}
        onClick={open}
        aria-label={compact ? `Ta bort ${orderNo}` : undefined}
        title={compact ? "Ta bort order" : undefined}
      >
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2.5 4h11M6.5 4V2.5h3V4M4 4l.7 9.5h6.6L12 4M6.8 6.8v4.4M9.2 6.8v4.4" />
        </svg>
        {!compact && "Ta bort"}
      </button>
      <dialog
        ref={dialog}
        className={styles.dialog}
        aria-labelledby={titleId}
        onClick={(event) => {
          if (event.target === event.currentTarget) dialog.current?.close();
        }}
      >
        <div className={styles.dialogBody}>
          <div className={styles.dangerMark} aria-hidden="true">
            !
          </div>
          <h2 id={titleId} className={styles.dialogTitle}>
            Ta bort order <span className="mono">{orderNo}</span>?
          </h2>
          <p className={styles.muted}>
            Ordern till <strong>{customerName}</strong> — {badgeCount} {badgeCount === 1 ? "skylt" : "skyltar"} för {formatSek(totalSek)} exkl. moms — tas
            bort för gott tillsammans med tidslinje, korrektur och priser. Det går inte att ångra.
          </p>
          {atPrinter && (
            <div className={styles.dangerBox} role="note">
              <p>
                <strong>Ordern ligger redan hos tryckeriet</strong> (nr <span className="mono">{atPrinter}</span>). Att ta
                bort den här stoppar inte tillverkningen — kontakta Skylt &amp; Gravyrteknik om skyltarna inte ska göras.
              </p>
              <label className={styles.dangerCheck}>
                <input type="checkbox" checked={understood} onChange={(event) => setUnderstood(event.target.checked)} />
                Jag förstår och har kontaktat tryckeriet
              </label>
            </div>
          )}
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          <div className={styles.dialogActions}>
            <button type="button" className="btn btn--ghost" onClick={() => dialog.current?.close()} autoFocus>
              Avbryt
            </button>
            <button
              type="button"
              className={styles.dangerButton}
              disabled={pending || (atPrinter !== null && !understood)}
              onClick={confirm}
            >
              {pending ? "Tar bort…" : "Ta bort ordern"}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
