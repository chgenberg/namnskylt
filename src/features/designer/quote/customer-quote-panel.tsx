"use client";

import { useEffect, useRef } from "react";
import { companyLookupNote, useCompanyLookup } from "@/hooks/use-company-lookup";
import { filled, type CompanyHit } from "@/lib/company/lookup-model";
import { formatDay, formatSek, plural } from "@/lib/format";
import { CUSTOMER_PO_MAX } from "@/lib/orders/customer-po";
import sections from "../sections/sections.module.css";
import styles from "./quote.module.css";
import type { QuoteState } from "./use-quote";

interface CustomerQuotePanelProps {
  quote: QuoteState;
  /** Tillbaka till skylten. Varukorgen står kvar. */
  onBack: () => void;
}

/** Laddar ner en fil utan att lämna sidan: PDF:en är en bilaga. */
function download(path: string) {
  const link = document.createElement("a");
  link.href = path;
  link.download = "";
  document.body.append(link);
  link.click();
  link.remove();
}

/**
 * Kundens egen offert, i panelen bredvid dokumentet (besked av ägaren 2026-11-20: en slutkund,
 * inloggad eller inte, ska kunna ladda hem en offert som en återförsäljare, med sina priser och
 * med samma knapp). Kunden fyller i samma uppgifter som i kassan och laddar ner offerten som PDF.
 * Den sparas hos säljaren, och kunden godkänner den senare på sin egen sida, dit länken står i
 * PDF:en. Inget beställs här, och varukorgen står kvar.
 */
export function CustomerQuotePanel({ quote, onBack }: CustomerQuotePanelProps) {
  const { save, draft, contact, setContact } = quote;
  const saving = save.status === "saving";
  const saved = save.status === "saved" ? save.quote : null;

  /** Det registret fyllde i senast. Byts numret ersätts det som registret fyllde i, aldrig det som är skrivet för hand. */
  const autofilled = useRef<CompanyHit | null>(null);
  const company = useCompanyLookup((hit) => {
    const before = autofilled.current;
    autofilled.current = hit;
    setContact((current) => ({ ...current, company: filled(current.company, hit.name, before?.name) }));
  });
  const companyNote = companyLookupNote(company.status);

  // PDF:en laddas ner en gång, när offerten just har sparats. 3D-filmen hämtar kunden själv med knappen.
  const downloaded = useRef<string | null>(null);
  useEffect(() => {
    if (!saved || downloaded.current === saved.pdfPath) return;
    downloaded.current = saved.pdfPath;
    download(saved.pdfPath);
  }, [saved]);

  if (saved) {
    const films = quote.savedFilms;
    return (
      <div className={styles.panel} data-quote-panel data-quote-saved={saved.quoteNo}>
        <div className={styles.body}>
          <header className={styles.head}>
            <p className="eyebrow">Offert</p>
            <h1 className={styles.title}>Offert {saved.quoteNo} är klar</h1>
          </header>
          <p className={styles.lead} role="status">
            PDF:en laddas ner till din enhet. När ni har bestämt er öppnar ni offerten och klickar Godkänn, så går skyltarna
            till tillverkningen. Länken står också i PDF:en. Ingenting är beställt än.
          </p>
          <div className={styles.links}>
            {saved.quotePath && (
              <a className="btn btn--primary" href={saved.quotePath} target="_blank" rel="noopener">
                Öppna offerten
              </a>
            )}
            <a className="btn" href={saved.pdfPath} download>
              Ladda ner PDF:en igen
            </a>
            {films.map((film, index) => (
              <a key={film.url} className="btn" href={film.url} download={film.name} data-quote-film={film.name}>
                Ladda ner 3D-filmen{films.length > 1 ? ` (${index + 1})` : ""}
              </a>
            ))}
          </div>
          {quote.filmsLeft > 0 && (
            <p className={sections.cartNote} role="status" data-films-left={quote.filmsLeft}>
              {quote.filmsLeft === 1 ? "En 3D-film av skylten spelas in" : `${quote.filmsLeft} 3D-filmer av skyltarna spelas in`} och går
              att ladda ner här om en stund.
            </p>
          )}
          <p className={sections.cartNote}>Skyltarna ligger kvar i varukorgen, om ni hellre beställer direkt.</p>
        </div>
        <footer className={styles.foot}>
          <button
            type="button"
            className="btn btn--block"
            onClick={() => {
              quote.reset();
              onBack();
            }}
          >
            Tillbaka till skylten
          </button>
        </footer>
      </div>
    );
  }

  const quantity = draft ? draft.badges.reduce((total, badge) => total + Math.max(1, Math.floor(badge.quantity)), 0) : 0;
  return (
    <div className={styles.panel} data-quote-panel>
      <div className={styles.body}>
        <header className={styles.head}>
          <p className="eyebrow">Offert</p>
          <h1 className={styles.title}>Ladda ner en offert</h1>
        </header>
        <p className={styles.lead}>
          Så här ser offerten ut, med era priser. Fyll i era uppgifter och ladda ner den som PDF. Ingenting beställs: ni
          godkänner offerten senare, via länken i PDF:en, när ni har bestämt er.
        </p>

        <div className={styles.group}>
          <p className={sections.specTitle}>Era uppgifter</p>
          {/* Organisationsnumret står först: företagets namn fylls i av det. */}
          <label className="field">
            <span className="visually-hidden">Organisationsnummer</span>
            <input
              name="orgNumber"
              placeholder="Organisationsnummer"
              inputMode="numeric"
              maxLength={20}
              title="Tio siffror, till exempel 556123-4567"
              value={contact.orgNumber}
              disabled={saving}
              onChange={(event) => {
                const orgNumber = event.target.value;
                setContact((current) => ({ ...current, orgNumber }));
                company.lookup(orgNumber);
              }}
            />
          </label>
          {companyNote && (
            <p className={sections.cartNote} role="status">
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
              value={contact.company}
              disabled={saving}
              onChange={(event) => {
                const name = event.target.value;
                setContact((current) => ({ ...current, company: name }));
              }}
            />
          </label>
          <label className="field">
            <span className="visually-hidden">Ditt namn</span>
            <input
              name="name"
              placeholder="Ditt namn"
              maxLength={120}
              autoComplete="name"
              value={contact.name}
              disabled={saving}
              onChange={(event) => {
                const name = event.target.value;
                setContact((current) => ({ ...current, name }));
              }}
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
              value={contact.email}
              disabled={saving}
              onChange={(event) => {
                const email = event.target.value;
                setContact((current) => ({ ...current, email }));
              }}
            />
          </label>
        </div>

        <div className={styles.group}>
          <p className={sections.specTitle}>Valfritt</p>
          <label className={styles.labelled}>
            <span>Projekt</span>
            <span className="field">
              <input
                type="text"
                maxLength={120}
                placeholder="Till exempel Namnskyltar till butiken"
                value={quote.project}
                disabled={saving}
                onChange={(event) => quote.setProject(event.target.value)}
              />
            </span>
          </label>
          <label className={styles.labelled}>
            <span>Ert inköpsnummer</span>
            <span className="field">
              <input
                type="text"
                maxLength={CUSTOMER_PO_MAX}
                autoComplete="off"
                placeholder="Står på offerten och följer med till fakturan"
                value={quote.customerPo}
                disabled={saving}
                onChange={(event) => quote.setCustomerPo(event.target.value)}
              />
            </span>
          </label>
        </div>

        <p className={sections.cartNote}>
          Offerten gäller skyltarna i varukorgen och skylten du just har gjort, till och med {formatDay(quote.validUntil)}.
          Leveransadressen fyller ni i när ni godkänner. Offerten och era uppgifter sparas hos oss, så att den går att
          godkänna senare.
        </p>
      </div>

      <footer className={styles.foot}>
        {save.status === "error" && (
          <p className={sections.issue} data-severity="error" role="alert">
            {save.message}
          </p>
        )}
        {quote.sellerFailed && (
          <p className={sections.issue} data-severity="error" role="alert">
            Offerten gick inte att visa just nu. Försök igen om en stund.
          </p>
        )}
        {draft && (
          <p className={styles.sum}>
            <span>{plural(quantity, "skylt", "skyltar")}</span>
            <strong>{formatSek(draft.totalSek)} exkl. moms</strong>
          </p>
        )}
        <div className={styles.actions}>
          <button type="button" className="btn" disabled={saving} onClick={onBack}>
            Tillbaka till skylten
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={saving || quote.blank || quote.capturing || !draft}
            onClick={() => void quote.submit()}
          >
            {saving ? "Sparar…" : quote.capturing ? "Tar bilder…" : "Ladda ner offert"}
          </button>
        </div>
        {quote.blank && <p className={sections.cartNote}>Skylten är tom. Skriv ett namn eller lägg in en logga först.</p>}
      </footer>
    </div>
  );
}
