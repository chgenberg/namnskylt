"use client";

import { useState, type FormEvent } from "react";
import styles from "./production-login.module.css";

export function ProductionLogin() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (sending || !password) return;
    setSending(true);
    setError(null);
    try {
      const response = await fetch("/api/production/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (response.ok) {
        window.location.reload();
        return;
      }
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(response.status === 401 ? "Fel kod" : (body?.error ?? "Något gick fel"));
    } catch {
      setError("Kunde inte nå servern.");
    }
    setSending(false);
  };

  return (
    <div className={styles.page}>
      <form className={styles.card} onSubmit={(event) => void submit(event)}>
        <p className={styles.eyebrow}>Verkstad</p>
        <h1 className={styles.title}>Logga in</h1>
        <label className={`field ${styles.field}`}>
          <span className="visually-hidden">Verkstadens kod</span>
          <input
            type="password"
            autoComplete="current-password"
            autoFocus
            placeholder="Kod"
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
        <button type="submit" className="btn btn--ink btn--block" disabled={sending || !password}>
          {sending ? "Loggar in…" : "Logga in"}
        </button>
      </form>
    </div>
  );
}
