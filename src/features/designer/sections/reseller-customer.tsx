"use client";

import { useMemo, useState } from "react";
import { Segmented } from "@/components/ui/segmented";
import type { CustomerChoice } from "../reseller";
import styles from "./sections.module.css";

/** Kunden säljaren har valt i varukorgen: en av de gamla, eller en ny som fylls i. */
export type CustomerTarget =
  | { kind: "existing"; id: string }
  | { kind: "new"; company: string; orgNumber: string; name: string; email: string; phone: string };

const NEW_CUSTOMER: CustomerTarget = { kind: "new", company: "", orgNumber: "", name: "", email: "", phone: "" };

/** Valet när varukorgen öppnas: listan när säljaren har kunder, annars en ny kund. */
export function firstTarget(customers: readonly CustomerChoice[]): CustomerTarget {
  return customers.length > 0 ? { kind: "existing", id: "" } : NEW_CUSTOMER;
}

type TargetResult = { ok: true; body: { customerId: string } | { customer: Record<string, string> } } | { ok: false; error: string };

/**
 * Vem ordern eller offerten går till, som säljaren ska se den vid knapparna:
 * kunden och adressen offerten mejlas till. `null` innan någon kund är vald.
 * Raden står alltid kvar, också när sökningen har gömt den valda kunden i listan.
 */
export function recipientOf(
  target: CustomerTarget,
  customers: readonly CustomerChoice[],
  /** På en offert som säljaren skickar själv räcker ett företagsnamn eller ett namn, utan e-post. */
  minimal = false,
): { label: string; email: string; demo?: boolean } | null {
  if (target.kind === "existing") {
    const chosen = customers.find((customer) => customer.id === target.id);
    return chosen ? { label: chosen.label, email: chosen.email, ...(chosen.demo && { demo: true }) } : null;
  }
  const label = target.company.trim() || target.name.trim();
  return label && (minimal || target.email.trim()) ? { label, email: target.email.trim() } : null;
}

/** Det som skickas med ordern eller offerten, eller felet som ska visas. */
export function customerOf(
  target: CustomerTarget,
  customers: readonly CustomerChoice[],
  needsInvoiceDetails: boolean,
  /** En offert som säljaren skickar själv: kunden får sakna kontaktperson och e-post. Servern prövar samma regel. */
  minimal = false,
): TargetResult {
  if (target.kind === "existing") {
    const chosen = customers.find((customer) => customer.id === target.id);
    return chosen ? { ok: true, body: { customerId: chosen.id } } : { ok: false, error: "Välj en kund, eller fyll i en ny." };
  }
  const name = target.name.trim();
  const email = target.email.trim();
  if (minimal) {
    if (!name && !target.company.trim()) return { ok: false, error: "Fyll i kundens företag eller namn." };
  } else if (!name || !email) return { ok: false, error: "Fyll i kundens kontaktperson och e-post." };
  if (needsInvoiceDetails && !(target.company.trim() && target.orgNumber.trim())) {
    return { ok: false, error: "Fyll i kundens företag och organisationsnummer. Skylt & Gravyrteknik fakturerar kunden." };
  }
  const optional = Object.fromEntries(
    Object.entries({ company: target.company, orgNumber: target.orgNumber, phone: target.phone })
      .map(([key, value]) => [key, value.trim()] as const)
      .filter(([, value]) => value !== ""),
  );
  // Tomma fält skickas inte: servern sätter företagets namn som namn när kontaktpersonen saknas.
  return { ok: true, body: { customer: { ...(name && { name }), ...(email && { email }), ...optional } } };
}

const KIND_OPTIONS = [
  { id: "existing", label: "Befintlig kund" },
  { id: "new", label: "Ny kund" },
] as const;

/** Så många kunder syns i listan utan sökning. Resten nås med sökrutan. */
const VISIBLE_CUSTOMERS = 30;

interface ResellerCustomerProps {
  customers: readonly CustomerChoice[];
  value: CustomerTarget;
  onChange: (value: CustomerTarget) => void;
  /** En ny kund behöver företag och organisationsnummer. */
  needsInvoiceDetails: boolean;
  disabled?: boolean;
  /** Raden under organisationsnumret: att företagets uppgifter hämtas, är hämtade eller inte fanns. */
  note?: string | null;
  /** En offert som säljaren skickar själv: det räcker med företagets namn, och e-posten är frivillig. */
  minimal?: boolean;
}

/**
 * Kunden ordern eller offerten gäller, vald i varukorgen: en av säljarens
 * gamla kunder ur listan, eller en ny som fylls i här (besked av ägaren
 * 2026-11-17). Från panelen är kunden redan vald, och då visas inte valet.
 */
export function ResellerCustomer({ customers, value, onChange, needsInvoiceDetails, disabled, note, minimal = false }: ResellerCustomerProps) {
  const [query, setQuery] = useState("");
  const selectedId = value.kind === "existing" ? value.id : "";
  const matches = useMemo(() => {
    const words = query.trim().toLowerCase();
    const found = words ? customers.filter((customer) => `${customer.label} ${customer.detail}`.toLowerCase().includes(words)) : customers;
    const shown = found.slice(0, VISIBLE_CUSTOMERS);
    // Den valda kunden står alltid kvar överst, också när sökningen eller listans längd annars gömde den.
    const selected = customers.find((customer) => customer.id === selectedId);
    return selected && !shown.includes(selected) ? [selected, ...shown] : shown;
  }, [customers, query, selectedId]);
  const fresh = value.kind === "new" ? value : null;
  const field = (key: "company" | "orgNumber" | "name" | "email" | "phone", label: string, options: { required?: boolean; type?: string; autoComplete?: string } = {}) => (
    <label className="field">
      <span className="visually-hidden">{label}</span>
      <input
        placeholder={options.required ? `${label} *` : label}
        type={options.type ?? "text"}
        autoComplete={options.autoComplete}
        maxLength={key === "email" ? 200 : 120}
        disabled={disabled}
        value={fresh?.[key] ?? ""}
        onChange={(event) => fresh && onChange({ ...fresh, [key]: event.target.value })}
      />
    </label>
  );

  return (
    <div className={styles.customer}>
      <p className={styles.specTitle}>Kund</p>
      {customers.length > 0 && (
        <Segmented
          label="Kund"
          value={value.kind}
          options={KIND_OPTIONS}
          // Ett klick på det som redan är valt ska inte tömma det som är ifyllt.
          onChange={(kind) => kind !== value.kind && onChange(kind === "existing" ? { kind: "existing", id: "" } : NEW_CUSTOMER)}
        />
      )}
      {value.kind === "existing" ? (
        <>
          <label className="field">
            <span className="visually-hidden">Sök kund</span>
            <input type="search" placeholder="Sök företag, namn eller e-post" value={query} disabled={disabled} onChange={(event) => setQuery(event.target.value)} />
          </label>
          <div className={styles.customerList} role="radiogroup" aria-label="Välj kund">
            {matches.map((customer) => (
              <button
                key={customer.id}
                type="button"
                role="radio"
                aria-checked={value.id === customer.id}
                className={styles.customerOption}
                disabled={disabled}
                onClick={() => onChange({ kind: "existing", id: customer.id })}
              >
                <strong>
                  {customer.label}
                  {/* En demokund ska synas som det redan i listan: det som görs till den går aldrig till verkstaden. */}
                  {customer.demo && <em className={styles.demoMark}>Demo</em>}
                </strong>
                <span>{customer.detail}</span>
              </button>
            ))}
            {matches.length === 0 && <p className={styles.cartNote}>Ingen kund matchar. Välj Ny kund.</p>}
          </div>
        </>
      ) : (
        <>
          {/* Organisationsnumret står först: företagets namn och adress fylls i av det. */}
          {field("orgNumber", "Organisationsnummer", { required: needsInvoiceDetails, autoComplete: "off" })}
          {note && (
            <p className={styles.cartNote} role="status">
              {note}
            </p>
          )}
          {field("company", "Företag", { required: needsInvoiceDetails || minimal, autoComplete: "off" })}
          {field("name", "Kontaktperson", { required: !minimal, autoComplete: "off" })}
          {field("email", "E-post", { required: !minimal, type: "email", autoComplete: "off" })}
          {field("phone", "Telefon", { type: "tel", autoComplete: "off" })}
          {minimal && <p className={styles.cartNote}>Det räcker med företagets namn. Resten är frivilligt.</p>}
        </>
      )}
    </div>
  );
}
