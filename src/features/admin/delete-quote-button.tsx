"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition } from "react";
import { formatSek, plural } from "@/lib/format";
import { deleteQuoteAction } from "./quote-actions";
import styles from "./admin.module.css";

interface DeleteQuoteButtonProps {
  quoteNo: string;
  /** Kunden offerten gäller, eller "Utan kund" för ett utkast. */
  customerName: string;
  badgeCount: number;
  totalSek: number;
  /** Bara papperskorgen, för kortet i listan. */
  compact?: boolean;
  /** Vart sidan går efteråt: offertens egen sida finns inte längre. */
  redirectTo?: string;
}

/**
 * Tar bort en offert för gott (besked via ägaren 2026-11-20: offerter ska gå att ta bort, ordrar
 * inte). Makulera drar tillbaka offerten men låter den stå kvar i listan. Ta bort tar den ur
 * listan, med sin historik, och kundens länk slutar gälla. En offert som har blivit en order går
 * inte att ta bort: knappen visas inte för den, och servern nekar.
 */
export function DeleteQuoteButton({ quoteNo, customerName, badgeCount, totalSek, compact = false, redirectTo }: DeleteQuoteButtonProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const open = () => {
    setError(null);
    dialog.current?.showModal();
  };

  const confirm = () => {
    setError(null);
    startTransition(async () => {
      const result = await deleteQuoteAction(quoteNo);
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
        aria-label={compact ? `Ta bort ${quoteNo}` : undefined}
        title={compact ? "Ta bort offert" : undefined}
        data-delete-quote={quoteNo}
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
            Ta bort offert <span className="mono">{quoteNo}</span>?
          </h2>
          <p className={styles.muted}>
            Offerten till <strong>{customerName}</strong> — {plural(badgeCount, "skylt", "skyltar")} för {formatSek(totalSek)} exkl. moms — tas bort för
            gott tillsammans med sin historik, och kundens länk slutar gälla. Det går inte att ångra.
          </p>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          <div className={styles.dialogActions}>
            <button type="button" className="btn btn--ghost" onClick={() => dialog.current?.close()} autoFocus>
              Avbryt
            </button>
            <button type="button" className={styles.dangerButton} disabled={pending} onClick={confirm}>
              {pending ? "Tar bort…" : "Ta bort offerten"}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
