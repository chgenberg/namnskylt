"use client";

import { useTransition } from "react";
import { insertDemoDataAction, removeDemoDataAction } from "./actions";
import styles from "./admin.module.css";

/** Visas över varje adminsida när demodata finns, så att ingen tar den för riktiga ordrar. */
export function DemoBanner({ count }: { count: number }) {
  const [pending, startTransition] = useTransition();
  return (
    <div className={styles.demoBanner} role="status">
      <span className={styles.demoDot} aria-hidden="true" />
      <span>
        <strong>Demodata visas.</strong> {count} {count === 1 ? "order är påhittad" : "ordrar är påhittade"} och skickas aldrig
        till tillverkningen.
      </span>
      <button
        type="button"
        className={styles.tinyButton}
        disabled={pending}
        onClick={() => {
          if (!window.confirm("Ta bort all demodata? Riktiga ordrar påverkas inte.")) return;
          startTransition(async () => {
            await removeDemoDataAction();
          });
        }}
      >
        {pending ? "Tar bort…" : "Ta bort demodata"}
      </button>
    </div>
  );
}

interface FillDemoButtonProps {
  label?: string;
  onDark?: boolean;
  /** En länk i löpande text i stället för en knapp, när demodatan inte är huvudsaken. */
  quiet?: boolean;
}

export function FillDemoButton({ label = "Fyll med demodata", onDark = false, quiet = false }: FillDemoButtonProps) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      className={quiet ? styles.quietLink : onDark ? `btn btn--lg ${styles.onDarkButton}` : "btn btn--primary"}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await insertDemoDataAction();
        })
      }
    >
      {pending ? "Lägger in…" : label}
    </button>
  );
}
