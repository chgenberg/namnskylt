"use client";

import styles from "./cart.module.css";

interface CartButtonProps {
  /** Antal skyltar i varukorgen. */
  count: number;
  onOpen: () => void;
  /** Sidan har inget sidhuvud att sitta i: knappen ligger då fast längst upp till höger. */
  floating?: boolean;
}

/** Fler än så ryms inte i märket på symbolen. */
const MAX_SHOWN = 99;

/**
 * Varukorgens symbol längst upp till höger (besked av ägaren 2026-11-17).
 * Den öppnar varukorgen, där ordern eller offerten skickas. Märket visar hur
 * många skyltar som ligger där.
 */
export function CartButton({ count, onOpen, floating = false }: CartButtonProps) {
  const label = count === 0 ? "Varukorg, tom" : `Varukorg, ${count} ${count === 1 ? "skylt" : "skyltar"}`;
  return (
    <button type="button" className={styles.button} data-floating={floating || undefined} aria-label={label} title="Varukorg" onClick={onOpen}>
      <svg className={styles.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 4h2.2l2.3 10.4a1.6 1.6 0 0 0 1.6 1.2h7.9a1.6 1.6 0 0 0 1.5-1.2L20 8H6.3" />
        <circle cx="9.6" cy="19.4" r="1.3" />
        <circle cx="16.6" cy="19.4" r="1.3" />
      </svg>
      {count > 0 && (
        <span className={styles.count} aria-hidden="true">
          {count > MAX_SHOWN ? `${MAX_SHOWN}+` : count}
        </span>
      )}
    </button>
  );
}
