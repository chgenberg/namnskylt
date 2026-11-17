"use client";

import { MIN_CUSTOMER_PASSWORD_CHARS, type CustomerAccountView } from "@/lib/customer-auth/model";
import styles from "./sections.module.css";

/** Det kunden fyller i om sig själv i kassan. */
interface CheckoutContact {
  company: string;
  orgNumber: string;
  name: string;
  email: string;
  terms: boolean;
}

const EMPTY_CONTACT: CheckoutContact = { company: "", orgNumber: "", name: "", email: "", terms: false };

/**
 * Kassans uppgifter för en inloggad kund: kontots uppgifter gäller, och det
 * som redan är skrivet står kvar där kontot saknar något. Villkoren kryssas
 * alltid i på nytt.
 */
export function contactFor(account: CustomerAccountView | null | undefined, current: CheckoutContact = EMPTY_CONTACT): CheckoutContact {
  if (!account) return current;
  const { profile } = account;
  return {
    ...current,
    company: profile.company || current.company,
    orgNumber: profile.orgNumber || current.orgNumber,
    name: profile.name || current.name,
    email: account.email,
  };
}

/** Kunden vill ha ett konto, och lösenordet som väljs för det. */
export interface NewAccountChoice {
  wanted: boolean;
  password: string;
}

interface NewAccountFieldProps {
  value: NewAccountChoice;
  onChange: (value: NewAccountChoice) => void;
  disabled?: boolean;
}

/** Valet i kassan att skapa ett konto med e-postadressen ovanför: ett kryss och ett lösenord. */
export function NewAccountField({ value, onChange, disabled }: NewAccountFieldProps) {
  return (
    <>
      <label className={styles.consent}>
        <input type="checkbox" checked={value.wanted} disabled={disabled} onChange={(event) => onChange({ ...value, wanted: event.target.checked })} />
        <span>Skapa konto, så är uppgifterna ifyllda nästa gång och du ser dina ordrar</span>
      </label>
      {value.wanted && (
        <label className="field">
          <span className="visually-hidden">Lösenord för kontot</span>
          <input
            type="password"
            placeholder={`Välj lösenord, minst ${MIN_CUSTOMER_PASSWORD_CHARS} tecken`}
            required
            minLength={MIN_CUSTOMER_PASSWORD_CHARS}
            maxLength={200}
            autoComplete="new-password"
            disabled={disabled}
            value={value.password}
            onChange={(event) => onChange({ ...value, password: event.target.value })}
          />
        </label>
      )}
    </>
  );
}
