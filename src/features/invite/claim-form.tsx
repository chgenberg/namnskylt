"use client";

import { useState, useTransition } from "react";
import { claimInviteAction } from "./invite-actions";
import { MIN_PASSWORD_CHARS } from "./limits";
import styles from "./invite.module.css";

export function ClaimForm({ token, email }: { token: string; email: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        setError(null);
        startTransition(async () => {
          const result = await claimInviteAction(token, {
            name: String(form.get("name") ?? ""),
            email: String(form.get("email") ?? ""),
            password: String(form.get("password") ?? ""),
          });
          if (result.ok) window.location.href = `/admin/butiker/${result.slug}`;
          else setError(result.error);
        });
      }}
    >
      <label className={styles.field}>
        <span>Ditt namn</span>
        <input name="name" required minLength={2} maxLength={120} autoComplete="name" />
      </label>
      <label className={styles.field}>
        <span>E-post</span>
        <input name="email" type="email" required defaultValue={email} autoComplete="email" />
      </label>
      <label className={styles.field}>
        <span>Lösenord</span>
        <input name="password" type="password" required minLength={MIN_PASSWORD_CHARS} autoComplete="new-password" />
        <small>Minst {MIN_PASSWORD_CHARS} tecken. Har du redan ett konto — skriv dess lösenord.</small>
      </label>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="btn btn--primary btn--lg" disabled={pending}>
        {pending ? "Skapar kontot…" : "Ta över butiken"}
      </button>
    </form>
  );
}
