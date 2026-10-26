"use client";

import { useEffect, useState } from "react";
import styles from "./visualize.module.css";

interface GeneratingStatusProps {
  startedAt: number;
  /** Steg som visas i tur och ordning, med sekunden de börjar. */
  steps: readonly (readonly [atS: number, label: string])[];
}

export function GeneratingStatus({ startedAt, steps }: GeneratingStatusProps) {
  const [now, setNow] = useState(startedAt);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, []);

  const elapsedS = Math.max(0, Math.floor((now - startedAt) / 1000));
  const step = steps.findLast(([atS]) => elapsedS >= atS)?.[1] ?? "";

  return (
    <p className={styles.status} role="status" aria-live="polite">
      <span className={styles.statusDot} aria-hidden="true" />
      <span>{step}</span>
      <span className={`mono ${styles.statusTime}`}>{elapsedS} s</span>
    </p>
  );
}
