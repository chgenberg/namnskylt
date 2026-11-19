"use client";

import { useEffect, useRef } from "react";
import { formatSek, plural } from "@/lib/format";
import type { ResellerOrderContext } from "../reseller";
import { ResellerCustomer } from "../sections/reseller-customer";
import sections from "../sections/sections.module.css";
import styles from "./quote.module.css";
import { QUOTE_FIELD_IDS, type QuoteState } from "./use-quote";

interface QuotePanelProps {
  reseller: ResellerOrderContext;
  quote: QuoteState;
  /** Tillbaka till skylten, utan att spara. */
  onBack: () => void;
}

/** Så länge väntar varje film efter den förra: webbläsare släpper inte igenom flera nedladdningar i samma ögonblick. */
const DOWNLOAD_GAP_MS = 700;

/** Laddar ner en fil utan att lämna sidan: PDF:en är en bilaga, och filmerna ligger i webbläsarens minne. */
function download(path: string, name = "") {
  const link = document.createElement("a");
  link.href = path;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
}

/**
 * Offertens uppgifter, i panelen bredvid dokumentet (beslut av ägaren 2026-11-19, efter hur
 * offerten görs i Merchin: dokumentet i mitten och inmatningen bredvid). Säljaren väljer
 * kund, fyller i projekt, giltighet och hälsning, väljer om loggan ska stå på offerten, och
 * sparar. Då laddas PDF:en ner, och offerten väntar i panelen på Godkänn eller Neka.
 */
export function QuotePanel({ reseller, quote, onBack }: QuotePanelProps) {
  const { save, draft } = quote;
  const saving = save.status === "saving";
  const saved = save.status === "saved" ? save.quote : null;

  // PDF:en och filmerna laddas ner en gång, när offerten just har sparats.
  const downloaded = useRef<string | null>(null);
  useEffect(() => {
    if (!saved || downloaded.current === saved.quoteNo) return;
    downloaded.current = saved.quoteNo;
    download(saved.pdfPath);
    saved.films.forEach((film, index) => window.setTimeout(() => download(film.url, film.name), DOWNLOAD_GAP_MS * (index + 1)));
  }, [saved]);

  if (saved) {
    return (
      <div className={styles.panel} data-quote-panel data-quote-saved={saved.quoteNo}>
        <div className={styles.body}>
          <header className={styles.head}>
            <p className="eyebrow">Offert</p>
            <h1 className={styles.title}>Offert {saved.quoteNo} är sparad</h1>
          </header>
          <p className={styles.lead} role="status">
            {saved.films.length > 0
              ? `PDF:en och ${saved.films.length === 1 ? "en 3D-film av skylten" : `${saved.films.length} 3D-filmer av skyltarna`} laddas ner till din enhet. Bifoga dem i ditt mejl till kunden.`
              : "PDF:en laddas ner till din enhet. Skicka den till kunden."}{" "}
            När kunden har svarat godkänner eller nekar du offerten under Offerter i panelen. Godkänner du blir den en
            order som går till tillverkningen.
          </p>
          <div className={styles.links}>
            <a className="btn btn--primary" href={`/admin/offerter/${saved.quoteNo}`}>
              Öppna offerten i panelen
            </a>
            <a className="btn" href={saved.pdfPath} download>
              Ladda ner PDF:en igen
            </a>
            {/* Frågar webbläsaren om lov för flera filer kan en film utebli. Då hämtas den här. */}
            {saved.films.map((film, index) => (
              <a key={film.url} className="btn" href={film.url} download={film.name} data-quote-film={film.name}>
                Ladda ner 3D-filmen igen{saved.films.length > 1 ? ` (${index + 1})` : ""}
              </a>
            ))}
          </div>
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
            Gör en ny skylt
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
          <h1 className={styles.title}>{quote.recipient ? `Offert till ${quote.recipient.label}` : "Ny offert"}</h1>
        </header>
        <p className={styles.lead}>
          Så här ser offerten ut. När du sparar laddas den ner som PDF, tillsammans med en 3D-film av varje skylt, som
          du själv skickar till kunden. Inget mejlas härifrån.
        </p>
        <ul className={styles.tips}>
          <li>Klicka på rubriken eller texterna i offerten för att ändra dem.</li>
          <li>Ikonerna bredvid offerten lägger till och tar bort delar, som loggan, bilderna och momsen.</li>
        </ul>

        <div id={QUOTE_FIELD_IDS.customer} className={styles.anchor}>
          {reseller.customerId ? (
            <p className={sections.cartNote}>
              Kund: <strong>{reseller.customerName}</strong>
            </p>
          ) : (
            <ResellerCustomer
              customers={reseller.customers ?? []}
              value={quote.target}
              onChange={quote.setTarget}
              needsInvoiceDetails={reseller.needsInvoiceDetails ?? false}
              disabled={saving}
            />
          )}
        </div>
        {quote.recipient?.demo && (
          <p className={sections.demoNote} role="status" data-demo-customer>
            Det här är en demokund. En godkänd offert blir en demoorder, som inte skickas till tillverkningen. Välj en
            annan kund, eller Ny kund, för en riktig offert.
          </p>
        )}

        <div className={styles.group}>
          <p className={sections.specTitle}>Uppgifter</p>
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
            <span>Giltig till</span>
            <span className="field">
              <input
                id={QUOTE_FIELD_IDS.validUntil}
                type="date"
                value={quote.validUntil}
                disabled={saving}
                onChange={(event) => quote.setValidUntil(event.target.value)}
              />
            </span>
          </label>
        </div>

        <p className={sections.cartNote}>
          Offerten gäller skyltarna i varukorgen och skylten du just har gjort, till listpris
          {reseller.purchaseList ? ". Din marginal ändrar du i rutan bredvid summan, som bara du ser" : ""}. Leverans
          och villkor ändrar du i panelen efteråt.
        </p>
      </div>

      <footer className={styles.foot}>
        {save.status === "error" && (
          <p className={sections.issue} data-severity="error" role="alert">
            {save.message}
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
            disabled={saving || quote.blank || quote.capturing || quote.recording !== null}
            onClick={() => void quote.submit()}
          >
            {saving
              ? "Sparar…"
              : quote.capturing
                ? "Tar bilder…"
                : quote.recording
                  ? `Spelar in film ${quote.recording.done + 1}/${quote.recording.total}…`
                  : "Spara"}
          </button>
        </div>
        {quote.blank && <p className={sections.cartNote}>Skylten är tom. Skriv ett namn eller lägg in en logga först.</p>}
      </footer>
    </div>
  );
}
