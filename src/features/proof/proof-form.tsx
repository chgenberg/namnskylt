"use client";

import { useState, useTransition } from "react";
import { decideProofAction } from "./actions";
import styles from "./proof.module.css";

type Decision = "approved" | "changes";

export function ProofForm({ token, decided }: { token: string; decided: Decision | null }) {
  const [result, setResult] = useState<Decision | null>(decided);
  const [mode, setMode] = useState<"choose" | "changes">("choose");
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const send = (approved: boolean) => {
    setError(null);
    startTransition(async () => {
      const response = await decideProofAction({ token, approved, comment: approved ? undefined : comment });
      if (!response.ok) {
        setError(response.error ?? "Något gick fel");
        return;
      }
      setResult(approved ? "approved" : "changes");
    });
  };

  if (result) {
    return (
      <div className={styles.done} data-tone={result}>
        <span className={styles.doneIcon} aria-hidden="true">
          {result === "approved" ? "✓" : "✎"}
        </span>
        <div>
          <strong>{result === "approved" ? "Tack — skyltarna är godkända" : "Tack — vi tittar på ändringarna"}</strong>
          <p>
            {result === "approved"
              ? "De går nu vidare till gravyren. Du får besked när de skickas."
              : "Du får en ny korrektur så snart ändringarna är gjorda."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.decision}>
      {mode === "changes" ? (
        <>
          <label className={styles.label} htmlFor="proof-comment">
            Vad ska ändras?
          </label>
          <textarea
            id="proof-comment"
            className={styles.textarea}
            value={comment}
            autoFocus
            maxLength={1000}
            placeholder="T.ex. ”Stavning: Ahmed ska vara Ahmad” eller ”Större logga”."
            onChange={(event) => setComment(event.target.value)}
          />
          <div className={styles.buttons}>
            <button type="button" className="btn btn--ghost" onClick={() => setMode("choose")}>
              Tillbaka
            </button>
            <button type="button" className="btn btn--primary" disabled={pending || !comment.trim()} onClick={() => send(false)}>
              {pending ? "Skickar…" : "Skicka ändringarna"}
            </button>
          </div>
        </>
      ) : (
        <div className={styles.buttons}>
          <button type="button" className="btn btn--ghost btn--lg" onClick={() => setMode("changes")}>
            Något ska ändras
          </button>
          <button type="button" className="btn btn--primary btn--lg" disabled={pending} onClick={() => send(true)}>
            {pending ? "Godkänner…" : "Godkänn skyltarna"}
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
