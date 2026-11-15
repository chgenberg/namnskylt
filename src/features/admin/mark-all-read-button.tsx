"use client";

import { useTransition } from "react";
import { markNoticesReadAction } from "./notice-actions";
import styles from "./admin.module.css";

export function MarkAllReadButton() {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      className={styles.ghostButton}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await markNoticesReadAction({ all: true });
        })
      }
    >
      {pending ? "Markerar…" : "Markera alla som lästa"}
    </button>
  );
}
