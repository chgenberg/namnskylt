"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { dispatchOrderAction } from "./dispatch-actions";
import styles from "./admin.module.css";

/** Skickar en order till verkstaden. Frågar först, eftersom en skickad order tillverkas och faktureras. */
export function DispatchButton({ orderNo, retry }: { orderNo: string; retry: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <>
      <button
        type="button"
        className={styles.ghostButton}
        disabled={pending}
        onClick={() => {
          if (!window.confirm(`Skicka ${orderNo} till Skylt & Gravyrteknik? Ordern tillverkas och faktureras.`)) return;
          setError(null);
          startTransition(async () => {
            const result = await dispatchOrderAction(orderNo);
            if (!result.ok) setError(result.error);
            router.refresh();
          });
        }}
      >
        {pending ? "Skickar…" : retry ? "Försök igen" : "Skicka"}
      </button>
      {error && (
        <span className={styles.error} role="alert" style={{ display: "block", whiteSpace: "normal" }}>
          {error}
        </span>
      )}
    </>
  );
}
