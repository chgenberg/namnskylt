"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { DeliveryFields } from "@/components/delivery-fields";
import { ShippingMethodPicker } from "@/components/shipping-method-picker";
import type { ShippingMethod } from "@/engine";
import { formatSek } from "@/lib/format";
import { needsPhone, shippingAddressFromDraft, type DeliveryDraft } from "@/lib/orders/delivery";
import type { QuoteAnswer } from "@/lib/quotes/quote-email";
import { decideQuoteAction } from "./actions";
import styles from "./quote-public.module.css";

type Result = { kind: "accepted"; orderNo?: string; orderPath?: string | null } | { kind: "declined" };

/** Ett leveranssätt kunden kan välja, med frakten och summan det ger. */
export interface QuoteShippingOption {
  method: ShippingMethod;
  shippingSek: number;
  totalInclVatSek: number;
}

interface QuoteDecisionProps {
  token: string;
  totalInclVatSek: number;
  /**
   * Leveransadressen kunden ska fylla i eller bekräfta, förifylld med det som
   * redan är känt. `null` när skyltarna skickas till återförsäljaren.
   */
  deliveryDraft: DeliveryDraft | null;
  /** Leveranssätten kunden väljer mellan. Tom när skyltarna skickas till återförsäljaren. */
  shippingOptions?: readonly QuoteShippingOption[];
  /** Leveranssättet som står på offerten. */
  shippingMethod?: ShippingMethod;
  /**
   * Valet mottagaren gjorde i offertmejlet. Det är förvalt här, och ett klick
   * bekräftar. Länken i mejlet avgör aldrig något själv: mejlprogram öppnar
   * länkar av sig själva, och ett godkännande blir en riktig order.
   */
  answer?: QuoteAnswer | null;
}

export function QuoteDecision({ token, totalInclVatSek, deliveryDraft, shippingOptions = [], shippingMethod = "standard", answer = null }: QuoteDecisionProps) {
  const [result, setResult] = useState<Result | null>(null);
  const [method, setMethod] = useState<ShippingMethod>(shippingMethod);
  const chosen = shippingOptions.find((option) => option.method === method);
  // Summan följer leveranssättet. Expressfraktens pris sätts i efterhand och är inte med.
  const payInclVatSek = chosen?.totalInclVatSek ?? totalInclVatSek;
  const [address, setAddress] = useState<DeliveryDraft | null>(deliveryDraft);
  const [declining, setDeclining] = useState(answer === "decline");
  const blockRef = useRef<HTMLDivElement>(null);
  // Den som kommer från mejlets knapp ska hamna vid valet, inte överst på offerten.
  useEffect(() => {
    if (answer) blockRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [answer]);
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
    const delivery = accept && address ? shippingAddressFromDraft(address, method) : null;
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
        ...(accept && chosen && { method }),
      });
      if (!response.ok) {
        setError(response.error ?? "Något gick fel");
        return;
      }
      setResult(accept ? { kind: "accepted", orderNo: response.orderNo, orderPath: response.orderPath } : { kind: "declined" });
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
          {result.kind === "accepted" && result.orderPath && (
            <p>
              <Link href={result.orderPath}>Följ din order</Link>
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div ref={blockRef} className={styles.decision} data-answer={answer ?? undefined}>
      {answer && (
        <p className={styles.fromEmail} role="status">
          {answer === "accept" && !declining
            ? "Du valde Godkänn i mejlet. Kontrollera uppgifterna och bekräfta med knappen nedan."
            : answer === "decline" && declining
              ? "Du valde Neka i mejlet. Bekräfta med knappen nedan."
              : "Ingenting är bestämt förrän du bekräftar med en av knapparna nedan."}
        </p>
      )}
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
              <DeliveryFields value={address} onChange={setAddress} disabled={pending} phoneRequired={needsPhone(method)} />
            </div>
          )}
          {shippingOptions.length > 1 && (
            <div className={styles.delivery}>
              <p className={styles.label}>Leveranssätt</p>
              <ShippingMethodPicker
                value={method}
                onChange={setMethod}
                methods={shippingOptions.map((option) => option.method)}
                standardSek={shippingOptions.find((option) => option.method === "standard")?.shippingSek ?? null}
                disabled={pending}
              />
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
              {pending ? "Godkänner…" : `Godkänn · ${formatSek(payInclVatSek)} inkl. moms${method === "express" && chosen ? " + frakt" : ""}`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
