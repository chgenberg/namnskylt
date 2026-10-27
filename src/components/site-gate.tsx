"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import styles from "./site-gate.module.css";

interface SiteGateProps {
  unlocked: boolean;
  children: ReactNode;
}

export function SiteGate({ unlocked, children }: SiteGateProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (unlocked) return;
    const node = dialog.current;
    if (node && !node.open) node.showModal();
  }, [unlocked]);

  if (unlocked) return children;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (sending) return;
    if (!password) {
      setError("Skriv in koden");
      setAttempt((n) => n + 1);
      return;
    }
    setSending(true);
    setError(null);
    try {
      const response = await fetch("/api/gate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (response.ok) {
        window.location.reload();
        return;
      }
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(response.status === 401 ? "Fel kod — försök igen" : (body?.error ?? "Något gick fel"));
      setAttempt((n) => n + 1);
      setSending(false);
    } catch {
      setError("Kunde inte nå servern. Försök igen.");
      setSending(false);
    }
  };

  return (
    <div className={`${styles.veil} dot-grid`}>
      <div className={styles.glow} aria-hidden="true" />
      <dialog
        ref={dialog}
        className={styles.dialog}
        aria-labelledby="gate-title"
        onCancel={(event) => event.preventDefault()}
      >
        <div className={styles.hero}>
          <Image
            src="/gate-badge.jpg"
            alt="Graverad namnskylt i mässing med texten Välkommen"
            width={1100}
            height={582}
            priority
            className={styles.badge}
          />
        </div>
        <form className={styles.panel} onSubmit={(event) => void submit(event)} noValidate>
          <p className={styles.eyebrow}>
            <span className={styles.lock} aria-hidden="true">
              <svg viewBox="0 0 16 16" width="12" height="12">
                <rect x="3" y="7" width="10" height="7" rx="1.6" fill="currentColor" />
                <path d="M5.2 7V5.4a2.8 2.8 0 0 1 5.6 0V7" fill="none" stroke="currentColor" strokeWidth="1.6" />
              </svg>
            </span>
            Förhandsvisning
          </p>
          <h1 id="gate-title" className={styles.title}>
            Välkommen till namnskylt.com
          </h1>
          <p className={styles.lead}>Sajten är under uppbyggnad. Skriv in koden du fått för att komma in.</p>

          <div key={attempt} className={styles.inputRow} data-error={Boolean(error)}>
            <label className={styles.field}>
              <span className="visually-hidden">Inloggningskod</span>
              <input
                type={visible ? "text" : "password"}
                name="password"
                autoComplete="current-password"
                autoFocus
                placeholder="Inloggningskod"
                value={password}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? "gate-error" : undefined}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setError(null);
                }}
              />
              <button
                type="button"
                className={styles.toggle}
                aria-label={visible ? "Dölj koden" : "Visa koden"}
                aria-pressed={visible}
                onClick={() => setVisible((v) => !v)}
              >
                {visible ? "Dölj" : "Visa"}
              </button>
            </label>
          </div>
          <p id="gate-error" className={styles.error} role="alert">
            {error}
          </p>

          <button type="submit" className={`btn btn--primary btn--lg btn--block ${styles.submit}`} disabled={sending}>
            {sending ? "Öppnar…" : "Öppna sajten"}
            {!sending && (
              <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
                <path d="M3 8h10M9 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>
          <p className={styles.footnote}>Graverat i Sverige · Skylt &amp; Gravyrteknik</p>
        </form>
      </dialog>
    </div>
  );
}
