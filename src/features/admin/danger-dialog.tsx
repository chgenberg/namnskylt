"use client";

import { useId, useRef, useState, useTransition, type ReactNode } from "react";
import styles from "./admin.module.css";

interface DangerDialogProps {
  /** Texten på knappen som öppnar dialogen. */
  label: string;
  title: ReactNode;
  /** Texten på knappen som tar bort, och medan det pågår. */
  confirmLabel: string;
  pendingLabel?: string;
  /** Kryssrutan som måste bockas i innan det går att ta bort, om någon. */
  check?: string;
  /** Sant medan dialogens innehåll hämtas: då går det inte att bekräfta. */
  loading?: boolean;
  /** Körs varje gång dialogen öppnas, t.ex. för att räkna vad som tas bort. */
  onOpen?: () => void;
  onConfirm: () => Promise<{ ok: true } | { ok: false; error: string }>;
  /** Körs när raderingen är klar och dialogen är stängd. */
  onDone: () => void;
  children: ReactNode;
}

/** Bekräftelsen före en radering som inte går att ångra: vad som tas bort, vad som behålls, och en röd knapp. */
export function DangerDialog({
  label,
  title,
  confirmLabel,
  pendingLabel = "Tar bort…",
  check,
  loading = false,
  onOpen,
  onConfirm,
  onDone,
  children,
}: DangerDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [understood, setUnderstood] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const open = () => {
    setError(null);
    setUnderstood(false);
    onOpen?.();
    dialog.current?.showModal();
  };

  const confirm = () => {
    setError(null);
    startTransition(async () => {
      const result = await onConfirm();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      dialog.current?.close();
      onDone();
    });
  };

  return (
    <>
      <button type="button" className={styles.dangerGhost} onClick={open}>
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2.5 4h11M6.5 4V2.5h3V4M4 4l.7 9.5h6.6L12 4M6.8 6.8v4.4M9.2 6.8v4.4" />
        </svg>
        {label}
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
            {title}
          </h2>
          {children}
          {check && (
            <label className={styles.dangerCheck}>
              <input type="checkbox" checked={understood} onChange={(event) => setUnderstood(event.target.checked)} />
              {check}
            </label>
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
              disabled={pending || loading || (Boolean(check) && !understood)}
              onClick={confirm}
            >
              {pending ? pendingLabel : confirmLabel}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
