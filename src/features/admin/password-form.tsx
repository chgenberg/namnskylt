"use client";

import { useState, useTransition } from "react";
import { MIN_PASSWORD_CHARS } from "@/lib/reseller-auth/limits";
import { changePasswordAction } from "./reseller-admin-actions";
import styles from "./admin.module.css";

/** Återförsäljaren byter sitt eget lösenord. */
export function PasswordForm() {
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const data = new FormData(form);
        const next = String(data.get("next") ?? "");
        if (next !== String(data.get("repeat") ?? "")) {
          setNote({ ok: false, text: "De nya lösenorden är inte lika" });
          return;
        }
        setNote(null);
        startTransition(async () => {
          const result = await changePasswordAction({ current: String(data.get("current") ?? ""), next });
          setNote(result.ok ? { ok: true, text: "Lösenordet är bytt" } : { ok: false, text: result.error });
          if (result.ok) form.reset();
        });
      }}
    >
      <div className={styles.formGrid}>
        <label className={styles.formRow}>
          <span className={styles.formLabel}>Nuvarande lösenord</span>
          <input className={styles.input} name="current" type="password" required autoComplete="current-password" />
        </label>
        <label className={styles.formRow}>
          <span className={styles.formLabel}>Nytt lösenord, minst {MIN_PASSWORD_CHARS} tecken</span>
          <input className={styles.input} name="next" type="password" required minLength={MIN_PASSWORD_CHARS} autoComplete="new-password" />
        </label>
        <label className={styles.formRow}>
          <span className={styles.formLabel}>Nytt lösenord en gång till</span>
          <input className={styles.input} name="repeat" type="password" required minLength={MIN_PASSWORD_CHARS} autoComplete="new-password" />
        </label>
      </div>
      <div className={styles.actionBar}>
        <button type="submit" className="btn btn--primary" disabled={pending}>
          {pending ? "Byter…" : "Byt lösenord"}
        </button>
        {note && (
          <span className={note.ok ? styles.success : styles.error} role="status">
            {note.text}
          </span>
        )}
      </div>
    </form>
  );
}
