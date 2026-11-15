"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { clearErrorLogAction } from "./ops-actions";
import admin from "../admin.module.css";

/** Tömmer felloggen. Frågar först, eftersom felen inte går att få tillbaka. */
export function ClearErrorsButton() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <>
      <button
        type="button"
        className={admin.ghostButton}
        disabled={pending}
        onClick={() => {
          if (!window.confirm("Rensa felloggen? Felen går inte att få tillbaka.")) return;
          setError(null);
          startTransition(async () => {
            const result = await clearErrorLogAction();
            if (!result.ok) setError(result.error);
            router.refresh();
          });
        }}
      >
        {pending ? "Rensar…" : "Rensa felloggen"}
      </button>
      {error && (
        <span className={admin.error} role="alert">
          {error}
        </span>
      )}
    </>
  );
}
