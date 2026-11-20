"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { DeliveryFields } from "@/components/delivery-fields";
import { ShippingMethodPicker } from "@/components/shipping-method-picker";
import type { ShippingMethod } from "@/engine";
import { companyLookupNote, useCompanyLookup } from "@/hooks/use-company-lookup";
import { filled, withCompanyAddress, type CompanyHit } from "@/lib/company/lookup-model";
import { formatSek } from "@/lib/format";
import { CUSTOMER_PO_MAX } from "@/lib/orders/customer-po";
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
  /** Inköpsnumret som redan står på offerten. Kunden kan fylla i eller ändra det innan offerten godkänns. */
  customerPo?: string | null;
  /**
   * Valet mottagaren gjorde i offertmejlet. Det är förvalt här, och ett klick
   * bekräftar. Länken i mejlet avgör aldrig något själv: mejlprogram öppnar
   * länkar av sig själva, och ett godkännande blir en riktig order.
   */
  answer?: QuoteAnswer | null;
  /**
   * Offerten saknar kund i registret: kunden laddade ner den själv utan att lägga upp sig. Då fyller
   * kunden i sina uppgifter här, samma som i kassan, förifyllda med det den skrev på offerten.
   */
  party?: QuoteParty | null;
}

/** Kundens uppgifter på en offert som saknar kund i registret. */
export interface QuoteParty {
  orgNumber: string;
  company: string;
  name: string;
  email: string;
}

export function QuoteDecision({
  token,
  totalInclVatSek,
  deliveryDraft,
  shippingOptions = [],
  shippingMethod = "standard",
  customerPo = null,
  answer = null,
  party: firstParty = null,
}: QuoteDecisionProps) {
  const [result, setResult] = useState<Result | null>(null);
  const [method, setMethod] = useState<ShippingMethod>(shippingMethod);
  const chosen = shippingOptions.find((option) => option.method === method);
  // Summan följer leveranssättet. Expressfraktens pris sätts i efterhand och är inte med.
  const payInclVatSek = chosen?.totalInclVatSek ?? totalInclVatSek;
  const [address, setAddress] = useState<DeliveryDraft | null>(deliveryDraft);
  const [party, setParty] = useState<QuoteParty | null>(firstParty);
  /** Det registret fyllde i senast. Byts numret ersätts det som registret fyllde i, aldrig det som är skrivet för hand. */
  const autofilled = useRef<CompanyHit | null>(null);
  const company = useCompanyLookup((hit) => {
    const before = autofilled.current;
    autofilled.current = hit;
    setParty((current) => (current ? { ...current, company: filled(current.company, hit.name, before?.name) } : current));
    setAddress((current) => (current ? withCompanyAddress(current, hit, before) : current));
  });
  const companyNote = companyLookupNote(company.status);
  const [declining, setDeclining] = useState(answer === "decline");
  const blockRef = useRef<HTMLDivElement>(null);
  // Den som kommer från mejlets knapp ska hamna vid valet, inte överst på offerten.
  useEffect(() => {
    if (answer) blockRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [answer]);
  const [reason, setReason] = useState("");
  /** Kundens eget inköpsnummer, som följer med ordern och står på fakturan (besked av ägaren 2026-11-20). */
  const [po, setPo] = useState(customerPo ?? "");
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
    // Uppgifterna behövs för ordern och fakturan. Ett nej behöver dem inte.
    if (accept && party) {
      const missing = !party.orgNumber.trim()
        ? "Skriv organisationsnumret"
        : party.company.trim().length < 2
          ? "Skriv företagets namn"
          : !party.name.trim()
            ? "Skriv ditt namn"
            : !/^\S+@\S+\.\S+$/.test(party.email.trim())
              ? "Skriv din e-postadress"
              : null;
      if (missing) {
        setError(missing);
        return;
      }
    }
    startTransition(async () => {
      const response = await decideQuoteAction({
        token,
        accept,
        reason: accept ? undefined : reason,
        delivery: delivery?.address,
        ...(accept && chosen && { method }),
        ...(accept && po.trim() && { customerPo: po.trim() }),
        ...(accept &&
          party && { customer: { company: party.company.trim(), orgNumber: party.orgNumber.trim(), name: party.name.trim(), email: party.email.trim() } }),
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
          {party && (
            <div className={styles.delivery} data-quote-party>
              <p className={styles.label}>Era uppgifter</p>
              {/* Organisationsnumret står först: företagets namn och adress fylls i av det. */}
              <label className="field">
                <span className="visually-hidden">Organisationsnummer</span>
                <input
                  name="orgNumber"
                  placeholder="Organisationsnummer"
                  inputMode="numeric"
                  maxLength={20}
                  title="Tio siffror, till exempel 556123-4567"
                  value={party.orgNumber}
                  disabled={pending}
                  onChange={(event) => {
                    setParty({ ...party, orgNumber: event.target.value });
                    company.lookup(event.target.value);
                  }}
                />
              </label>
              {companyNote && (
                <p className={styles.partyNote} role="status">
                  {companyNote}
                </p>
              )}
              <label className="field">
                <span className="visually-hidden">Företagsnamn</span>
                <input
                  name="company"
                  placeholder="Företagsnamn"
                  maxLength={120}
                  autoComplete="organization"
                  value={party.company}
                  disabled={pending}
                  onChange={(event) => setParty({ ...party, company: event.target.value })}
                />
              </label>
              <label className="field">
                <span className="visually-hidden">Ditt namn</span>
                <input
                  name="name"
                  placeholder="Ditt namn"
                  maxLength={120}
                  autoComplete="name"
                  value={party.name}
                  disabled={pending}
                  onChange={(event) => setParty({ ...party, name: event.target.value })}
                />
              </label>
              <label className="field">
                <span className="visually-hidden">E-post</span>
                <input
                  name="email"
                  type="email"
                  placeholder="E-post"
                  maxLength={200}
                  autoComplete="email"
                  value={party.email}
                  disabled={pending}
                  onChange={(event) => setParty({ ...party, email: event.target.value })}
                />
              </label>
            </div>
          )}
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
                parcelSek={shippingOptions.find((option) => option.method === "parcel")?.shippingSek ?? null}
                disabled={pending}
              />
            </div>
          )}
          <div className={styles.delivery}>
            <label className={styles.label} htmlFor="quote-customer-po">
              Ert inköpsnummer (valfritt)
            </label>
            <span className="field">
              <input
                id="quote-customer-po"
                type="text"
                maxLength={CUSTOMER_PO_MAX}
                autoComplete="off"
                placeholder="Står på fakturan"
                value={po}
                disabled={pending}
                onChange={(event) => setPo(event.target.value)}
              />
            </span>
          </div>
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
