"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { companyLookupNote, useCompanyLookup } from "@/hooks/use-company-lookup";
import { filled } from "@/lib/company/lookup-model";
import { applyAction } from "./apply-actions";
import styles from "./invite.module.css";

/**
 * Skapa konto. Samma rubriker och fält som när ett företag skapar konto hos
 * Skylt & Gravyrteknik, så att uppgifterna går rakt in hos verkstaden. Kontot
 * finns först när namnskylt.com har godkänt och den sökande har valt lösenord.
 */
export function ApplyForm() {
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [sameDelivery, setSameDelivery] = useState(true);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  // Formuläret är långt: felet ska synas även när fältet det gäller står högst upp.
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [error]);

  /** Det registret fyllde i senast, per fält. Byts numret ersätts det, aldrig det som är skrivet för hand. */
  const autofilled = useRef<Record<string, string>>({});
  // Fälten är webbläsarens egna, så registrets uppgifter skrivs rakt in i dem.
  const company = useCompanyLookup((hit) => {
    const put = (name: string, next: string) => {
      const input = formRef.current?.elements.namedItem(name);
      if (!(input instanceof HTMLInputElement)) return;
      input.value = filled(input.value, next, autofilled.current[name]);
      if (next) autofilled.current[name] = next;
    };
    put("company", hit.name);
    put("street", hit.line1);
    put("street2", hit.line2);
    put("zip", hit.zip);
    put("city", hit.city);
  });
  const companyNote = companyLookupNote(company.status);

  if (sent) {
    return (
      <div className={styles.done} role="status">
        <strong>Tack, uppgifterna är mottagna.</strong>
        <p>Vi går igenom dem och hör av oss via e-post med en länk där du väljer lösenord. Sedan är kontot klart.</p>
      </div>
    );
  }

  return (
    <form
      ref={formRef}
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const value = (name: string) => String(form.get(name) ?? "").trim();
        // Postnumret skrivs `123 45`, även när det fylldes i utan mellanslag.
        const zip = value("zip").replace(/\s+/g, "").replace(/^(\d{3})(\d{2})$/, "$1 $2");
        const company = value("company");
        const contactName = `${value("firstName")} ${value("lastName")}`.trim();
        const phone = value("phone");
        // Leveransadressen är fakturaadressen om inget annat fylls i.
        const to = sameDelivery ? "" : "delivery";
        const field = (name: string) => value(to ? `${to}${name[0]?.toUpperCase()}${name.slice(1)}` : name);
        setError(null);
        startTransition(async () => {
          const result = await applyAction({
            company,
            orgNumber: value("orgNumber"),
            contactName,
            email: value("email"),
            phone,
            address: [value("street"), value("street2"), `${zip} ${value("city")}`.trim()].filter(Boolean).join("\n"),
            invoiceEmail: value("invoiceEmail"),
            delivery: {
              name: company,
              contactName,
              line1: field("street"),
              line2: field("street2"),
              zip: field("zip"),
              city: field("city"),
              phone,
            },
            website: value("website"),
            message: value("message"),
            fax: value("fax"),
          });
          if (result.ok) setSent(true);
          else setError(result.error);
        });
      }}
    >
      <fieldset className={styles.group}>
        <legend>Företagsinformation</legend>
        {/* Organisationsnumret står först: företagets namn och adress fylls i av det. */}
        <label className={styles.field}>
          <span>Org.nr</span>
          <input
            name="orgNumber"
            required
            maxLength={20}
            placeholder="556123-4567"
            inputMode="numeric"
            onChange={(event) => company.lookup(event.target.value)}
          />
          {companyNote && <small role="status">{companyNote}</small>}
        </label>
        <label className={styles.field}>
          <span>Företagsnamn</span>
          <input name="company" required minLength={2} maxLength={120} autoComplete="organization" />
        </label>
      </fieldset>

      <fieldset className={styles.group}>
        <legend>Faktureringsadress</legend>
        <label className={styles.field}>
          <span>Adress</span>
          <input name="street" required maxLength={120} autoComplete="billing address-line1" />
        </label>
        <label className={styles.field}>
          <span>Adressrad 2 (valfritt)</span>
          <input name="street2" maxLength={120} autoComplete="billing address-line2" />
        </label>
        <div className={styles.pair}>
          <label className={styles.field}>
            <span>Postnr</span>
            <input name="zip" required maxLength={10} inputMode="numeric" pattern="\d{3}\s?\d{2}" title="Fem siffror" autoComplete="billing postal-code" />
          </label>
          <label className={styles.field}>
            <span>Postort</span>
            <input name="city" required maxLength={80} autoComplete="billing address-level2" />
          </label>
        </div>
        <label className={styles.field}>
          <span>E-post faktura (valfritt)</span>
          <input name="invoiceEmail" type="email" maxLength={200} placeholder="Samma som e-posten nedan" autoComplete="off" />
        </label>
      </fieldset>

      <fieldset className={styles.group}>
        <legend>Leveransadress</legend>
        <label className={styles.check}>
          <input type="checkbox" checked={sameDelivery} onChange={(event) => setSameDelivery(event.target.checked)} />
          <span>Samma som faktureringsadressen</span>
        </label>
        {!sameDelivery && (
          <>
            <label className={styles.field}>
              <span>Adress</span>
              <input name="deliveryStreet" required maxLength={120} autoComplete="shipping address-line1" />
            </label>
            <label className={styles.field}>
              <span>Adressrad 2 (valfritt)</span>
              <input name="deliveryStreet2" maxLength={120} autoComplete="shipping address-line2" />
            </label>
            <div className={styles.pair}>
              <label className={styles.field}>
                <span>Postnr</span>
                <input name="deliveryZip" required maxLength={10} inputMode="numeric" pattern="\d{3}\s?\d{2}" title="Fem siffror" autoComplete="shipping postal-code" />
              </label>
              <label className={styles.field}>
                <span>Postort</span>
                <input name="deliveryCity" required maxLength={80} autoComplete="shipping address-level2" />
              </label>
            </div>
          </>
        )}
      </fieldset>

      <fieldset className={styles.group}>
        <legend>Kontaktinformation</legend>
        <div className={styles.half}>
          <label className={styles.field}>
            <span>Förnamn</span>
            <input name="firstName" required maxLength={60} autoComplete="given-name" />
          </label>
          <label className={styles.field}>
            <span>Efternamn</span>
            <input name="lastName" required maxLength={60} autoComplete="family-name" />
          </label>
        </div>
        <label className={styles.field}>
          <span>E-post</span>
          <input name="email" type="email" required maxLength={200} autoComplete="email" />
          <small>Du loggar in med den här adressen.</small>
        </label>
        <label className={styles.field}>
          <span>Telefonnummer (valfritt)</span>
          <input name="phone" type="tel" maxLength={40} autoComplete="tel" />
        </label>
        <label className={styles.field}>
          <span>Hemsida (valfritt)</span>
          <input name="website" maxLength={200} placeholder="exempel.se" autoComplete="url" />
        </label>
        <label className={styles.field}>
          <span>Något vi bör veta? (valfritt)</span>
          <textarea name="message" rows={3} maxLength={1000} />
        </label>
      </fieldset>

      {/* Dolt för människor. En robot som fyller i alla fält avslöjar sig här. */}
      <input name="fax" tabIndex={-1} autoComplete="off" aria-hidden="true" className="visually-hidden" />
      {error && (
        <p ref={errorRef} className={styles.error} role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="btn btn--primary btn--lg" disabled={pending}>
        {pending ? "Skickar…" : "Skapa konto"}
      </button>
      <small className={styles.note}>
        Uppgifterna används för att lägga upp ert konto och för fakturor från Skylt &amp; Gravyrteknik, som tillverkar skyltarna.
      </small>
    </form>
  );
}
