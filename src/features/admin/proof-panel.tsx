"use client";

import { useState, useTransition } from "react";
import { formatDate } from "@/features/orders/format";
import type { Proof } from "@/lib/orders/repository";
import { createProofAction } from "./actions";
import styles from "./admin.module.css";

const PROOF_LABEL: Record<Proof["status"], string> = {
  pending: "Väntar på kunden",
  approved: "Godkänd av kunden",
  changes: "Kunden vill ändra",
};

interface ProofPanelProps {
  orderNo: string;
  proof: Proof | null;
  origin: string;
}

export function ProofPanel({ orderNo, proof, origin }: ProofPanelProps) {
  const [url, setUrl] = useState(proof ? `${origin}/korrektur/${proof.token}` : null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const create = () => {
    setError(null);
    startTransition(async () => {
      const result = await createProofAction(orderNo);
      if (!result.ok || !result.url) {
        setError(result.ok ? "Något gick fel" : result.error);
        return;
      }
      setUrl(result.url);
      setCopied(false);
    });
  };

  const copy = async () => {
    if (!url) return;
    await navigator.clipboard?.writeText(url).catch(() => undefined);
    setCopied(true);
  };

  return (
    <div className={styles.form}>
      {proof && (
        <p className={styles.muted}>
          <strong>{PROOF_LABEL[proof.status]}</strong>
          {proof.decidedAt ? ` · ${formatDate(proof.decidedAt)}` : ` · skapad ${formatDate(proof.createdAt)}`}
          {proof.comment && <span className={styles.stepNote}> ”{proof.comment}”</span>}
        </p>
      )}
      {url && (
        <div className={styles.copyRow}>
          <input className={styles.input} readOnly value={url} aria-label="Korrekturlänk" onFocus={(e) => e.target.select()} />
          <button type="button" className={styles.ghostButton} onClick={() => void copy()}>
            {copied ? "Kopierad" : "Kopiera"}
          </button>
        </div>
      )}
      <button type="button" className={styles.ghostButton} disabled={pending} onClick={create}>
        {pending ? "Skapar…" : url ? "Skapa ny korrekturlänk" : "Skapa korrekturlänk"}
      </button>
      <p className={styles.muted}>Kunden ser skyltarna och godkänner eller skriver vad som ska ändras.</p>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
