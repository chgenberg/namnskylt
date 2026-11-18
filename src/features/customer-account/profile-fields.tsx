"use client";

import { useEffect, useRef } from "react";
import { DeliveryFields } from "@/components/delivery-fields";
import { companyLookupNote, useCompanyLookup } from "@/hooks/use-company-lookup";
import { filled, withCompanyAddress, type CompanyHit } from "@/lib/company/lookup-model";
import type { ProfileDraft } from "@/lib/customer-auth/model";
import styles from "./account.module.css";

interface ProfileFieldsProps {
  value: ProfileDraft;
  onChange: (value: ProfileDraft) => void;
  disabled?: boolean;
}

/**
 * Uppgifterna kassan fylls i med: beställaren och leveransadressen. Samma
 * fält när kontot skapas och under Mitt konto. Allt får lämnas tomt.
 * Organisationsnumret står först: företagets namn och adress fylls i ur
 * registret när det är skrivet (besked av ägaren 2026-11-18).
 */
export function ProfileFields({ value, onChange, disabled }: ProfileFieldsProps) {
  const change = (patch: Partial<ProfileDraft>) => onChange({ ...value, ...patch });
  /** Det som står i fälten just nu, läst när registret svarar en stund efter att numret skrevs. */
  const latest = useRef({ value, onChange });
  useEffect(() => {
    latest.current = { value, onChange };
  });
  /** Det registret fyllde i senast. Byts numret ersätts det, aldrig det som är skrivet för hand. */
  const autofilled = useRef<CompanyHit | null>(null);
  const company = useCompanyLookup((hit) => {
    const before = autofilled.current;
    autofilled.current = hit;
    const current = latest.current.value;
    latest.current.onChange({
      ...current,
      company: filled(current.company, hit.name, before?.name),
      delivery: withCompanyAddress(current.delivery, hit, before),
    });
  });
  const note = companyLookupNote(company.status);
  return (
    <>
      <div className={styles.pair}>
        <label className={styles.labelled}>
          <span>Organisationsnummer</span>
          <span className="field">
            <input
              value={value.orgNumber}
              maxLength={20}
              inputMode="numeric"
              placeholder="556123-4567"
              disabled={disabled}
              onChange={(event) => {
                change({ orgNumber: event.target.value });
                company.lookup(event.target.value);
              }}
            />
          </span>
        </label>
        <label className={styles.labelled}>
          <span>Företagsnamn</span>
          <span className="field">
            <input value={value.company} maxLength={120} autoComplete="organization" disabled={disabled} onChange={(event) => change({ company: event.target.value })} />
          </span>
        </label>
      </div>
      {note && (
        <p className={styles.sectionLead} role="status">
          {note}
        </p>
      )}
      <label className={styles.labelled}>
        <span>Ditt namn</span>
        <span className="field">
          <input value={value.name} maxLength={120} autoComplete="name" disabled={disabled} onChange={(event) => change({ name: event.target.value })} />
        </span>
      </label>
      <fieldset className={styles.group}>
        <legend>Leveransadress</legend>
        {/* Adressen får lämnas tom. Fylls den i gäller samma krav som i kassan. */}
        <DeliveryFields value={value.delivery} onChange={(delivery) => change({ delivery })} disabled={disabled} required={false} />
      </fieldset>
    </>
  );
}
