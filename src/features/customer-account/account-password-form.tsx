"use client";

import { useState, useTransition, type FormEvent } from "react";
import { MIN_CUSTOMER_PASSWORD_CHARS } from "@/lib/customer-auth/model";
import { changePasswordAction } from "./actions";
import styles from "./account.module.css";

interface AccountPasswordFormProps {
  shop: string | null;
  /** Kontots e-postadress, så att lösenordshanteraren sparar det nya lösenordet på rätt inlogg. */
  email: string;
}

/** Kunden byter sitt lösenord: det nuvarande och ett nytt. */
export function AccountPasswordForm({ shop, email }: AccountPasswordFormProps) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [status, setStatus] = useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    startTransition(async () => {
      const result = await changePasswordAction(shop, { current, next });
      if (result.ok) {
        setCurrent("");
        setNext("");
      }
      setStatus(result.ok ? { tone: "good", text: "Lösenordet är bytt." } : { tone: "bad", text: result.error });
    });
  };

  return (
    <form className={styles.form} onSubmit={submit}>
      <input type="email" name="username" value={email} readOnly hidden autoComplete="username" />
      <div className={styles.pair}>
        <label className={styles.labelled}>
          <span>Nuvarande lösenord</span>
          <span className="field">
            <input type="password" required autoComplete="current-password" value={current} onChange={(event) => setCurrent(event.target.value)} />
          </span>
        </label>
        <label className={styles.labelled}>
          <span>Nytt lösenord, minst {MIN_CUSTOMER_PASSWORD_CHARS} tecken</span>
          <span className="field">
            <input
              type="password"
              required
              minLength={MIN_CUSTOMER_PASSWORD_CHARS}
              autoComplete="new-password"
              value={next}
              onChange={(event) => setNext(event.target.value)}
            />
          </span>
        </label>
      </div>
      {status && (
        <p className={status.tone === "good" ? styles.saved : styles.error} role={status.tone === "good" ? "status" : "alert"}>
          {status.text}
        </p>
      )}
      <div>
        <button type="submit" className="btn" disabled={pending}>
          {pending ? "Byter…" : "Byt lösenord"}
        </button>
      </div>
    </form>
  );
}
