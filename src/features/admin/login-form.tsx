"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import styles from "./admin.module.css";

/**
 * Två skilda inlogg. Admin är namnskylt.coms eget och har bara ett lösenord.
 * Återförsäljaren loggar in med e-post och lösenord på en egen sida, mot en
 * egen API-väg, så att det ena formuläret aldrig kan ge det andra inlogget.
 */
const LOGINS = {
  admin: {
    endpoint: "/api/admin/session",
    eyebrow: "Admin",
    lead: "För namnskylt.com: ordrar, butiker, utskick och prismodell.",
  },
  reseller: {
    endpoint: "/api/reseller/session",
    eyebrow: "Återförsäljare",
    lead: "Ordrar, offerter, kunder och inställningar för ditt företag.",
  },
} as const;

/** Panelens startsida. Återförsäljaren kommer dit från sin egen inloggningssida. */
const PANEL_PATH = "/admin";

export function LoginForm({ kind }: { kind: keyof typeof LOGINS }) {
  const login = LOGINS[kind];
  const withEmail = kind === "reseller";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const ready = password.length > 0 && (!withEmail || email.trim().length > 0);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (sending || !ready) return;
    setSending(true);
    setError(null);
    try {
      const response = await fetch(login.endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(withEmail ? { email: email.trim(), password } : { password }),
      });
      if (response.ok) {
        // Admin loggar in på sidan hen försökte öppna; återförsäljaren skickas till panelen.
        if (withEmail) window.location.assign(PANEL_PATH);
        else window.location.reload();
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
        <p className={styles.eyebrow}>{login.eyebrow}</p>
        <h1 className={styles.pageTitle}>Logga in</h1>
        <p className={styles.muted}>{login.lead}</p>
        {withEmail && (
          <label className={styles.formRow}>
            <span className="visually-hidden">E-post</span>
            <input
              className={styles.input}
              type="email"
              autoComplete="username"
              autoFocus
              required
              placeholder="E-post"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setError(null);
              }}
            />
          </label>
        )}
        <label className={styles.formRow}>
          <span className="visually-hidden">Lösenord</span>
          <input
            className={styles.input}
            type="password"
            autoComplete="current-password"
            autoFocus={!withEmail}
            required
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
        <button type="submit" className="btn btn--primary btn--lg btn--block" disabled={sending || !ready}>
          {sending ? "Loggar in…" : "Logga in"}
        </button>
        <p className={styles.loginFoot}>
          {withEmail ? (
            "Kontot skapas med länken i inbjudan från namnskylt.com."
          ) : (
            <>
              Är du återförsäljare?{" "}
              <Link href="/aterforsaljare" className={styles.link}>
                Logga in här
              </Link>
            </>
          )}
        </p>
      </form>
    </div>
  );
}
