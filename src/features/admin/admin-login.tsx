"use client";

import { useState, type FormEvent } from "react";
import styles from "./admin.module.css";

export function AdminLogin() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (sending || !password) return;
    setSending(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (response.ok) {
        window.location.reload();
        return;
      }
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "Något gick fel");
    } catch {
      setError("Kunde inte nå servern.");
    }
    setSending(false);
  };

  return (
    <div className={styles.login}>
      <form className={styles.loginCard} onSubmit={(event) => void submit(event)}>
        <span className={styles.loginMark} aria-hidden="true">
          <svg viewBox="0 0 20 20" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6">
            <rect x="2.5" y="5.5" width="15" height="9" rx="2" />
            <path d="M6 9h8M7.5 11.5h5" strokeLinecap="round" />
          </svg>
        </span>
        <p className={styles.eyebrow}>Återförsäljare</p>
        <h1 className={styles.pageTitle}>Logga in</h1>
        <p className={styles.muted}>Ordrar, kunder och statistik för namnskylt.com.</p>
        <label className={styles.formRow}>
          <span className="visually-hidden">Lösenord</span>
          <input
            className={styles.input}
            type="password"
            autoComplete="current-password"
            autoFocus
            placeholder="Lösenord"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              setError(null);
            }}
          />
        </label>
        <p className={styles.error} role="alert">
          {error}
        </p>
        <button type="submit" className="btn btn--primary btn--lg btn--block" disabled={sending || !password}>
          {sending ? "Loggar in…" : "Logga in"}
        </button>
      </form>
    </div>
  );
}
