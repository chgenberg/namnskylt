"use client";

import { useState } from "react";
import { reminderMailto, type ReminderDraft } from "@/lib/quotes/reminder";
import styles from "./admin.module.css";

interface QuoteReminderProps {
  /** Kundens e-post. En kund som sparats med bara företagets namn har ingen: då fylls mottagaren i i mejlprogrammet. */
  email: string | null;
  draft: ReminderDraft;
}

/**
 * Påminnelsen på offertens sida (beslut av ägaren 2026-11-24, efter Merchin): ett färdigt utkast
 * till ett uppföljningsmejl, som säljaren läser, ändrar och skickar från sitt eget mejlprogram.
 * Ingenting skickas eller sparas här.
 */
export function QuoteReminder({ email, draft }: QuoteReminderProps) {
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);
  const [copied, setCopied] = useState(false);

  if (!open) {
    return (
      <div className={styles.callout} data-tone="warn" data-quote-reminder>
        <strong>Kunden har inte svarat än</strong>
        <span>Det har gått några dagar sedan offerten skickades. Ett kort mejl brukar räcka för att få ett svar.</span>
        <button type="button" className="btn btn--ghost" style={{ justifySelf: "start" }} onClick={() => setOpen(true)}>
          Skriv påminnelse
        </button>
      </div>
    );
  }
  return (
    <div className={styles.form} data-quote-reminder>
      <label className={styles.formRow}>
        <span className={styles.formLabel}>Ämne</span>
        <input className={styles.input} value={subject} onChange={(event) => setSubject(event.target.value)} />
      </label>
      <label className={styles.formRow}>
        <span className={styles.formLabel}>Text</span>
        <textarea className={styles.textarea} rows={12} value={body} onChange={(event) => setBody(event.target.value)} />
      </label>
      <div className={styles.actionBar}>
        <a href={reminderMailto(email, { subject, body })} className="btn btn--primary">
          Öppna i mejlprogrammet
        </a>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={async () => {
            await navigator.clipboard?.writeText(`${subject}\n\n${body}`).catch(() => undefined);
            setCopied(true);
          }}
        >
          {copied ? "Kopierad" : "Kopiera"}
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => {
            setSubject(draft.subject);
            setBody(draft.body);
            setCopied(false);
          }}
        >
          Börja om
        </button>
      </div>
      <p className={styles.muted}>
        Inget skickas härifrån. Mejlet öppnas i ditt eget mejlprogram{email ? `, till ${email}` : ""}, där du läser och skickar det.
      </p>
    </div>
  );
}
