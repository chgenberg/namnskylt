"use client";

import { useState, useTransition } from "react";
import { formatSek } from "@/features/orders/format";
import { decideQuoteAction } from "./actions";
import styles from "./quote-public.module.css";

type Result = { kind: "accepted"; orderNo?: string } | { kind: "declined" };

export function QuoteDecision({ token, totalInclVatSek }: { token: string; totalInclVatSek: number }) {
  const [result, setResult] = useState<Result | null>(null);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const send = (accept: boolean) => {
    setError(null);
    startTransition(async () => {
      const response = await decideQuoteAction({ token, accept, reason: accept ? undefined : reason });
      if (!response.ok) {
        setError(response.error ?? "Något gick fel");
        return;
      }
      setResult(accept ? { kind: "accepted", orderNo: response.orderNo } : { kind: "declined" });
    });
  };

  if (result) {
    return (
      <div className={styles.done} data-tone={result.kind}>
        <span className={styles.doneIcon} aria-hidden="true">
          {result.kind === "accepted" ? "✓" : "–"}
        </span>
        <div>
          <strong>{result.kind === "accepted" ? "Tack! Offerten är godkänd" : "Tack för beskedet"}</strong>
          <p>
            {result.kind === "accepted"
              ? `Ordern ${result.orderNo ?? ""} är lagd och skyltarna går till gravyren. Du får besked när de skickas.`
              : "Vi hör av oss om något kan ändras."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.decision}>
      {declining ? (
        <>
          <label className={styles.label} htmlFor="decline-reason">
            Vill du berätta varför? (valfritt)
          </label>
          <textarea
            id="decline-reason"
            className={styles.textarea}
            value={reason}
            maxLength={1000}
            placeholder="T.ex. ”För dyrt” eller ”Vi vill ha en annan färg”."
            onChange={(e) => setReason(e.target.value)}
          />
          <div className={styles.buttons}>
            <button type="button" className="btn btn--ghost" onClick={() => setDeclining(false)}>
              Tillbaka
            </button>
            <button type="button" className="btn btn--ink" disabled={pending} onClick={() => send(false)}>
              {pending ? "Skickar…" : "Tacka nej"}
            </button>
          </div>
        </>
      ) : (
        <div className={styles.buttons}>
          <button type="button" className="btn btn--ghost btn--lg" onClick={() => setDeclining(true)}>
            Tacka nej
          </button>
          <button type="button" className="btn btn--primary btn--lg" disabled={pending} onClick={() => send(true)}>
            {pending ? "Godkänner…" : `Godkänn · ${formatSek(totalInclVatSek)} inkl. moms`}
          </button>
        </div>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
