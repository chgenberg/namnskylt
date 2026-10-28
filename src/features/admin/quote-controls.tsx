"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { formatSek } from "@/features/orders/format";
import { acceptQuoteForCustomerAction, cancelQuoteAction, sendQuoteAction, updateQuoteTermsAction } from "./quote-actions";
import styles from "./admin.module.css";

interface TermsFormProps {
  quoteNo: string;
  project: string | null;
  message: string | null;
  validUntil: string;
  editable: boolean;
}

export function QuoteTermsForm({ quoteNo, project, message, validUntil, editable }: TermsFormProps) {
  const [title, setTitle] = useState(project ?? "");
  const [text, setText] = useState(message ?? "");
  const [until, setUntil] = useState(validUntil);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const dirty = title !== (project ?? "") || text !== (message ?? "") || until !== validUntil;

  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        setNote(null);
        startTransition(async () => {
          const result = await updateQuoteTermsAction(quoteNo, { project: title, message: text, validUntil: until });
          setNote(result.ok ? { ok: true, text: "Sparat" } : { ok: false, text: result.error });
        });
      }}
    >
      <label className={styles.formRow}>
        <span className={styles.formLabel}>Projektets namn (offertens rubrik)</span>
        <input
          className={styles.input}
          maxLength={120}
          disabled={!editable}
          value={title}
          placeholder="Nya namnskyltar till receptionen"
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <label className={styles.formRow}>
        <span className={styles.formLabel}>Hälsning till kunden (syns överst i offerten)</span>
        <textarea
          className={styles.input}
          rows={4}
          maxLength={2000}
          disabled={!editable}
          value={text}
          placeholder="Hej! Här kommer offerten på namnskyltar till ert team, som vi pratade om."
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      <label className={styles.formRow}>
        <span className={styles.formLabel}>Giltig till och med</span>
        <input className={styles.input} type="date" disabled={!editable} value={until} onChange={(e) => setUntil(e.target.value)} />
      </label>
      {editable && (
        <div className={styles.actionBar}>
          <button type="submit" className="btn btn--ghost" disabled={pending || !dirty}>
            {pending ? "Sparar…" : "Spara villkor"}
          </button>
          {note && (
            <span className={note.ok ? styles.success : styles.error} role="status">
              {note.text}
            </span>
          )}
        </div>
      )}
    </form>
  );
}

interface SendPanelProps {
  quoteNo: string;
  customerName: string;
  email: string;
  totalSek: number;
  link: string | null;
  sent: boolean;
}

/** Skickar = låser upp kundens länk. Mejlet går från återförsäljarens egen e-post med länken ifylld. */
export function QuoteSendPanel({ quoteNo, customerName, email, totalSek, link: initial, sent }: SendPanelProps) {
  const [link, setLink] = useState(initial);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const send = () => {
    setError(null);
    startTransition(async () => {
      const result = await sendQuoteAction(quoteNo);
      if (!result.ok || !result.url) {
        setError(result.ok ? "Något gick fel" : result.error);
        return;
      }
      setLink(result.url);
    });
  };

  const mailto = link
    ? `mailto:${email}?subject=${encodeURIComponent(`Offert ${quoteNo} – namnskyltar`)}&body=${encodeURIComponent(
        `Hej ${customerName}!\n\nHär är offerten på namnskyltarna (${formatSek(totalSek)} exkl. moms). Du ser skyltarna och kan godkänna direkt här:\n${link}\n\nVänliga hälsningar`,
      )}`
    : null;

  return (
    <div className={styles.form}>
      {link ? (
        <>
          <div className={styles.copyRow}>
            <input className={styles.input} readOnly value={link} aria-label="Kundens offertlänk" onFocus={(e) => e.target.select()} />
            <button
              type="button"
              className={styles.ghostButton}
              onClick={async () => {
                await navigator.clipboard?.writeText(link).catch(() => undefined);
                setCopied(true);
              }}
            >
              {copied ? "Kopierad" : "Kopiera"}
            </button>
          </div>
          <div className={styles.actionBar}>
            {mailto && (
              <a href={mailto} className="btn btn--primary">
                Mejla offerten
              </a>
            )}
            <a href={link} target="_blank" rel="noreferrer" className="btn btn--ghost">
              Kundens vy ↗
            </a>
            <button type="button" className="btn btn--ghost" disabled={pending} onClick={send}>
              {pending ? "Skickar…" : "Skicka igen"}
            </button>
          </div>
        </>
      ) : (
        <button type="button" className="btn btn--primary btn--lg" disabled={pending} onClick={send}>
          {pending ? "Skickar…" : sent ? "Skicka igen" : "Skicka offerten"}
        </button>
      )}
      <p className={styles.muted}>Kunden ser skyltarna i 3D-bild, priset och kan godkänna eller tacka nej direkt på sidan.</p>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function QuoteDecisionButtons({ quoteNo, canCancel }: { quoteNo: string; canCancel: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className={styles.form}>
      <div className={styles.actionBar}>
        <button
          type="button"
          className={styles.repeat}
          disabled={pending}
          onClick={() => {
            if (!window.confirm("Kunden har godkänt — gör om offerten till en order nu?")) return;
            setError(null);
            startTransition(async () => {
              const result = await acceptQuoteForCustomerAction(quoteNo);
              if (!result.ok) return setError(result.error);
              if (result.orderNo) router.push(`/admin/ordrar/${result.orderNo}`);
            });
          }}
        >
          ✓ Godkänn åt kunden → order
        </button>
        {canCancel && (
          <button
            type="button"
            className={styles.ghostButton}
            disabled={pending}
            onClick={() => {
              if (!window.confirm("Makulera offerten? Kundens länk slutar gälla.")) return;
              startTransition(async () => {
                const result = await cancelQuoteAction(quoteNo);
                if (!result.ok) setError(result.error);
              });
            }}
          >
            Makulera
          </button>
        )}
      </div>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
