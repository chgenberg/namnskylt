"use client";

import { useState, useTransition } from "react";
import { saveDesignAction } from "./actions";
import styles from "./admin.module.css";

interface SaveDesignButtonProps {
  orderNo: string;
  badgeIndex: number;
  defaultName: string;
}

export function SaveDesignButton({ orderNo, badgeIndex, defaultName }: SaveDesignButtonProps) {
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const save = () => {
    const name = window.prompt("Namn på mallen", defaultName)?.trim();
    if (!name) return;
    startTransition(async () => {
      const result = await saveDesignAction(orderNo, badgeIndex, name);
      setSaved(result.ok);
    });
  };

  return (
    <button type="button" className={styles.tinyButton} disabled={pending || saved} onClick={save}>
      {saved ? "Sparad som mall" : pending ? "Sparar…" : "Spara som mall"}
    </button>
  );
}
