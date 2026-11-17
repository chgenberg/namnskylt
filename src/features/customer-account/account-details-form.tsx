"use client";

import { useState, useTransition, type FormEvent } from "react";
import { DeliveryFields } from "@/components/delivery-fields";
import { saveProfileAction, type ProfileInput } from "./actions";
import styles from "./account.module.css";

interface AccountDetailsFormProps {
  shop: string | null;
  initial: ProfileInput;
}

/** Uppgifterna kassan fylls i med: beställaren och leveransadressen. */
export function AccountDetailsForm({ shop, initial }: AccountDetailsFormProps) {
  const [values, setValues] = useState(initial);
  const [status, setStatus] = useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const change = (patch: Partial<ProfileInput>) => {
    setValues((current) => ({ ...current, ...patch }));
    setStatus(null);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    startTransition(async () => {
      const result = await saveProfileAction(shop, values);
      setStatus(result.ok ? { tone: "good", text: "Uppgifterna är sparade." } : { tone: "bad", text: result.error });
    });
  };

  return (
    <form className={styles.form} onSubmit={submit}>
      <div className={styles.pair}>
        <label className={styles.labelled}>
          <span>Företagsnamn</span>
          <span className="field">
            <input value={values.company} maxLength={120} autoComplete="organization" onChange={(event) => change({ company: event.target.value })} />
          </span>
        </label>
        <label className={styles.labelled}>
          <span>Organisationsnummer</span>
          <span className="field">
            <input
              value={values.orgNumber}
              maxLength={20}
              inputMode="numeric"
              placeholder="556123-4567"
              onChange={(event) => change({ orgNumber: event.target.value })}
            />
          </span>
        </label>
      </div>
      <label className={styles.labelled}>
        <span>Ditt namn</span>
        <span className="field">
          <input value={values.name} maxLength={120} autoComplete="name" onChange={(event) => change({ name: event.target.value })} />
        </span>
      </label>
      <fieldset className={styles.group}>
        <legend>Leveransadress</legend>
        {/* Adressen får lämnas tom. Fylls den i gäller samma krav som i kassan. */}
        <DeliveryFields value={values.delivery} onChange={(delivery) => change({ delivery })} disabled={pending} required={false} />
      </fieldset>
      {status && (
        <p className={status.tone === "good" ? styles.saved : styles.error} role={status.tone === "good" ? "status" : "alert"}>
          {status.text}
        </p>
      )}
      <div>
        <button type="submit" className="btn btn--primary" disabled={pending}>
          {pending ? "Sparar…" : "Spara uppgifterna"}
        </button>
      </div>
    </form>
  );
}
