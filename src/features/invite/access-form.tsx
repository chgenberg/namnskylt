"use client";

import { useState, useTransition } from "react";
import { setPasswordAction } from "./access-actions";
import { MIN_PASSWORD_CHARS } from "./limits";
import styles from "./invite.module.css";

interface AccessFormProps {
  token: string;
  /** Kontots e-postadress, visad så att lösenordshanteraren sparar rätt inlogg. */
  email: string;
  submitLabel: string;
}

/** Väljer lösenord via en hemlig länk: för ett nytt konto eller för ett som återställs. */
export function AccessForm({ token, email, submitLabel }: AccessFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const password = String(form.get("password") ?? "");
        if (password !== String(form.get("repeat") ?? "")) {
          setError("Lösenorden är inte lika");
          return;
        }
        setError(null);
        startTransition(async () => {
          const result = await setPasswordAction(token, password);
          if (result.ok) window.location.href = "/admin";
          else setError(result.error);
        });
      }}
    >
      <label className={styles.field}>
        <span>E-post</span>
        <input name="email" type="email" value={email} readOnly autoComplete="username" />
      </label>
      <label className={styles.field}>
        <span>Lösenord</span>
        <input name="password" type="password" required minLength={MIN_PASSWORD_CHARS} autoComplete="new-password" />
        <small>Minst {MIN_PASSWORD_CHARS} tecken.</small>
      </label>
      <label className={styles.field}>
        <span>Lösenordet en gång till</span>
        <input name="repeat" type="password" required minLength={MIN_PASSWORD_CHARS} autoComplete="new-password" />
      </label>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="btn btn--primary btn--lg" disabled={pending}>
        {pending ? "Sparar…" : submitLabel}
      </button>
    </form>
  );
}
