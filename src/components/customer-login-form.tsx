"use client";

import { useState, type FormEvent } from "react";
import { signInRequest } from "@/lib/customer-auth/client";
import { accountPaths } from "@/lib/customer-auth/model";
import type { CustomerAccountView } from "@/lib/customer-auth/model";
import styles from "./customer-login-form.module.css";

interface CustomerLoginFormProps {
  /** Butiken kunden loggar in i; `null` = namnskylt.com. */
  shop: string | null;
  onSignedIn: (account: CustomerAccountView) => void;
  /** Ställer markören i fältet för e-post när formuläret visas. */
  autoFocus?: boolean;
}

/** Slutkundens inloggning med e-post och lösenord. Samma formulär i varukorgen och på inloggningssidan. */
export function CustomerLoginForm({ shop, onSignedIn, autoFocus = false }: CustomerLoginFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (sending) return;
    setSending(true);
    setError(null);
    const result = await signInRequest(shop, email, password);
    setSending(false);
    if (result.ok) onSignedIn(result.account);
    else setError(result.error);
  };

  return (
    <form className={styles.form} onSubmit={(event) => void submit(event)}>
      <label className="field">
        <span className="visually-hidden">E-post</span>
        <input
          type="email"
          placeholder="E-post"
          required
          autoComplete="username"
          autoFocus={autoFocus}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>
      <label className="field">
        <span className="visually-hidden">Lösenord</span>
        <input
          type="password"
          placeholder="Lösenord"
          required
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="btn btn--primary btn--block" disabled={sending}>
        {sending ? "Loggar in…" : "Logga in"}
      </button>
      {/* Kunden ber själv om en länk för nytt lösenord (besked av ägaren 2026-11-24). */}
      <a href={accountPaths(shop).forgot} className={styles.forgot}>
        Glömt lösenordet?
      </a>
    </form>
  );
}
