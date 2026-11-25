"use client";

import { useState, useTransition, type FormEvent } from "react";
import { MIN_CUSTOMER_PASSWORD_CHARS } from "@/lib/customer-auth/model";
import { choosePasswordAction } from "./actions";
import styles from "./account.module.css";

interface PasswordLinkFormProps {
  token: string;
  /** Kontots e-postadress, visad så att lösenordshanteraren sparar rätt inlogg. */
  email: string;
  /** Länken kom från varukorgen: efter lösenordet går kunden tillbaka dit, inte till Mitt konto. */
  fromCart?: boolean;
}

/** Väljer nytt lösenord via säljarens länk. */
export function PasswordLinkForm({ token, email, fromCart = false }: PasswordLinkFormProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await choosePasswordAction(token, password);
      if (result.ok) window.location.assign(fromCart ? result.cart : result.home);
      else setError(result.error);
    });
  };

  return (
    <form className={styles.form} onSubmit={submit}>
      <label className="field">
        <span className="visually-hidden">E-post</span>
        <input type="email" value={email} readOnly autoComplete="username" />
      </label>
      <label className="field">
        <span className="visually-hidden">Nytt lösenord</span>
        <input
          type="password"
          placeholder={`Nytt lösenord, minst ${MIN_CUSTOMER_PASSWORD_CHARS} tecken`}
          required
          minLength={MIN_CUSTOMER_PASSWORD_CHARS}
          autoComplete="new-password"
          autoFocus
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="btn btn--primary btn--block" disabled={pending}>
        {pending ? "Sparar…" : "Spara lösenordet"}
      </button>
    </form>
  );
}
