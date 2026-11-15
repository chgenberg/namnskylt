"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { DeliveryFields } from "@/components/delivery-fields";
import { formatSek } from "@/lib/format";
import { addressFromDraft, type DeliveryDraft } from "@/lib/orders/delivery";
import { decideQuoteAction } from "./actions";
import styles from "./quote-public.module.css";

type Result = { kind: "accepted"; orderNo?: string } | { kind: "declined" };

interface QuoteDecisionProps {
  token: string;
  totalInclVatSek: number;
  /**
   * Leveransadressen kunden ska fylla i eller bekräfta, förifylld med det som
   * redan är känt. `null` när skyltarna skickas till återförsäljaren.
   */
  deliveryDraft: DeliveryDraft | null;
}

export function QuoteDecision({ token, totalInclVatSek, deliveryDraft }: QuoteDecisionProps) {
  const [result, setResult] = useState<Result | null>(null);
  const [address, setAddress] = useState<DeliveryDraft | null>(deliveryDraft);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const errorRef = useRef<HTMLParagraphElement>(null);
  // Felet står ovanför knapparna, men på en mobil kan även det hamna utanför det som syns.
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [error]);

  const send = (accept: boolean) => {
    setError(null);
    // Godkännandet behöver adressen; ett nej behöver den inte.
    const delivery = accept && address ? addressFromDraft(address) : null;
    if (delivery && !delivery.ok) {
      setError(delivery.error);
      return;
    }
    startTransition(async () => {
      const response = await decideQuoteAction({
        token,
        accept,
        reason: accept ? undefined : reason,
        delivery: delivery?.address,
      });
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
              ? `Ordern ${result.orderNo ?? ""} är lagd och skyltarna går till tillverkningen. Du får besked när de skickas.`
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
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
        </>
      ) : (
        <>
          {address && (
            <div className={styles.delivery}>
              <p className={styles.label}>Vart ska skyltarna skickas?</p>
              <DeliveryFields value={address} onChange={setAddress} disabled={pending} />
            </div>
          )}
          {error && (
            <p ref={errorRef} className={styles.error} role="alert">
              {error}
            </p>
          )}
          <div className={styles.buttons}>
            <button type="button" className="btn btn--ghost btn--lg" onClick={() => setDeclining(true)}>
              Tacka nej
            </button>
            <button type="button" className="btn btn--primary btn--lg" disabled={pending} onClick={() => send(true)}>
              {pending ? "Godkänner…" : `Godkänn · ${formatSek(totalInclVatSek)} inkl. moms`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
