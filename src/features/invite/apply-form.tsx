"use client";

import { useState, useTransition } from "react";
import { applyAction } from "./apply-actions";
import styles from "./invite.module.css";

/** Ansökan om att bli återförsäljare. namnskylt.com godkänner den innan kontot finns. */
export function ApplyForm() {
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

  if (sent) {
    return (
      <div className={styles.done} role="status">
        <strong>Tack, ansökan är mottagen.</strong>
        <p>Vi går igenom den och hör av oss via e-post med en länk där du väljer lösenord.</p>
      </div>
    );
  }

  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const value = (name: string) => String(form.get(name) ?? "");
        setError(null);
        startTransition(async () => {
          const result = await applyAction({
            company: value("company"),
            orgNumber: value("orgNumber"),
            contactName: value("contactName"),
            email: value("email"),
            phone: value("phone"),
            address: `${value("street").trim()}\n${value("zip").trim()} ${value("city").trim()}`.trim(),
            website: value("website"),
            message: value("message"),
            fax: value("fax"),
          });
          if (result.ok) setSent(true);
          else setError(result.error);
        });
      }}
    >
      <label className={styles.field}>
        <span>Företag</span>
        <input name="company" required minLength={2} maxLength={120} autoComplete="organization" />
      </label>
      <label className={styles.field}>
        <span>Organisationsnummer</span>
        <input name="orgNumber" required maxLength={20} placeholder="556123-4567" inputMode="numeric" />
      </label>
      <label className={styles.field}>
        <span>Kontaktperson</span>
        <input name="contactName" required minLength={2} maxLength={120} autoComplete="name" />
      </label>
      <label className={styles.field}>
        <span>E-post</span>
        <input name="email" type="email" required maxLength={200} autoComplete="email" />
      </label>
      <label className={styles.field}>
        <span>Telefon</span>
        <input name="phone" type="tel" maxLength={40} autoComplete="tel" />
      </label>
      <label className={styles.field}>
        <span>Fakturaadress</span>
        <input name="street" required maxLength={120} placeholder="Gatuadress" autoComplete="address-line1" />
      </label>
      <div className={styles.pair}>
        <label className={styles.field}>
          <span>Postnummer</span>
          <input name="zip" required maxLength={10} inputMode="numeric" autoComplete="postal-code" />
        </label>
        <label className={styles.field}>
          <span>Ort</span>
          <input name="city" required maxLength={80} autoComplete="address-level2" />
        </label>
      </div>
      <label className={styles.field}>
        <span>Hemsida</span>
        <input name="website" maxLength={200} placeholder="exempel.se" autoComplete="url" />
      </label>
      <label className={styles.field}>
        <span>Något vi bör veta? (valfritt)</span>
        <textarea name="message" rows={3} maxLength={1000} />
      </label>
      {/* Dolt för människor. En robot som fyller i alla fält avslöjar sig här. */}
      <input name="fax" tabIndex={-1} autoComplete="off" aria-hidden="true" className="visually-hidden" />
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="btn btn--primary btn--lg" disabled={pending}>
        {pending ? "Skickar…" : "Skicka ansökan"}
      </button>
      <small className={styles.note}>
        Uppgifterna används för att lägga upp ert konto och för fakturor från Skylt &amp; Gravyrteknik, som tillverkar skyltarna.
      </small>
    </form>
  );
}
