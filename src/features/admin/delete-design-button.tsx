"use client";

import { useTransition } from "react";
import { deleteDesignAction } from "./actions";
import styles from "./admin.module.css";

export function DeleteDesignButton({ designId, name }: { designId: string; name: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      className={styles.tinyButton}
      disabled={pending}
      onClick={() => {
        if (!window.confirm(`Ta bort mallen ”${name}”?`)) return;
        startTransition(async () => {
          await deleteDesignAction(designId);
        });
      }}
    >
      {pending ? "Tar bort…" : "Ta bort"}
    </button>
  );
}
