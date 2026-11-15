"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { forgotPasswordAction } from "./forgot-actions";
import styles from "./invite.module.css";

/** Formuläret för den som har glömt sitt lösenord. Svaret säger aldrig om adressen har ett konto. */
export function ForgotForm() {
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

  if (sent) {
    return (
      <div className={styles.done} role="status">
        <strong>Titta i din inkorg.</strong>
        <p>Finns adressen hos oss har vi mejlat en länk där du väljer ett nytt lösenord. Länken gäller i två timmar.</p>
        <p>
          <Link href="/aterforsaljare">Till inloggningen</Link>
        </p>
      </div>
    );
  }

  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        const email = String(new FormData(event.currentTarget).get("email") ?? "");
        setError(null);
        startTransition(async () => {
          const result = await forgotPasswordAction(email);
          if (result.ok) setSent(true);
          else setError(result.error);
        });
      }}
    >
      <label className={styles.field}>
        <span>E-post</span>
        <input name="email" type="email" required maxLength={200} autoComplete="email" />
        <small>Adressen du loggar in med.</small>
      </label>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="btn btn--primary btn--lg" disabled={pending}>
        {pending ? "Skickar…" : "Mejla en länk"}
      </button>
    </form>
  );
}
