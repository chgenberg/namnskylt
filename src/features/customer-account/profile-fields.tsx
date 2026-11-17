"use client";

import { DeliveryFields } from "@/components/delivery-fields";
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
 */
export function ProfileFields({ value, onChange, disabled }: ProfileFieldsProps) {
  const change = (patch: Partial<ProfileDraft>) => onChange({ ...value, ...patch });
  return (
    <>
      <div className={styles.pair}>
        <label className={styles.labelled}>
          <span>Företagsnamn</span>
          <span className="field">
            <input value={value.company} maxLength={120} autoComplete="organization" disabled={disabled} onChange={(event) => change({ company: event.target.value })} />
          </span>
        </label>
        <label className={styles.labelled}>
          <span>Organisationsnummer</span>
          <span className="field">
            <input
              value={value.orgNumber}
              maxLength={20}
              inputMode="numeric"
              placeholder="556123-4567"
              disabled={disabled}
              onChange={(event) => change({ orgNumber: event.target.value })}
            />
          </span>
        </label>
      </div>
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
