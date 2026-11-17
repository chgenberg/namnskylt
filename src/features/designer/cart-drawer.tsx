"use client";

import { useEffect, useRef, type ReactNode } from "react";
import styles from "./cart.module.css";

interface CartDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Raden under rubriken, till exempel `2 designer · 12 st`. */
  summary: string;
  children: ReactNode;
}

/**
 * Varukorgen: en panel från höger över skyltmotorn, öppnad med symbolen
 * längst upp till höger. Här ligger det som är lagt i varukorgen och kassan.
 * Panelen finns kvar i sidan när den är stängd, så att det som är ifyllt i
 * kassan står kvar när den öppnas igen.
 */
export function CartDrawer({ open, onClose, summary, children }: CartDrawerProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={styles.drawer}
      aria-labelledby="cart-title"
      onClose={onClose}
      // Ett klick utanför panelen träffar själva dialogen, inte dess innehåll.
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={styles.sheet}>
        <header className={styles.head}>
          <div>
            <h2 id="cart-title" className={styles.title}>
              Varukorg
            </h2>
            <p className={styles.summary}>{summary}</p>
          </div>
          <button type="button" className={styles.close} aria-label="Stäng varukorgen" onClick={onClose}>
            ×
          </button>
        </header>
        <div className={styles.body}>{children}</div>
      </div>
    </dialog>
  );
}
