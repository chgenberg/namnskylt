"use client";

import { useRef, useState, useTransition, type ChangeEvent } from "react";
import { useLightLogo } from "@/hooks/use-light-logo";
import { isHexColor, MAX_LOGO_DATA_URL_CHARS, readableOn, type CompanyProfile } from "@/lib/company/profile";
import { darkPlate } from "@/lib/images/logo-plate";
import { saveCompanyProfileAction } from "./actions";
import { scrapeCompanyAction } from "./company-actions";
import styles from "./admin.module.css";

const LOGO_MAX_WIDTH_PX = 600;

/** Uppladdad logga nedskalad i webbläsaren, så att den ryms i inställningarna. */
async function fileToLogo(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const scale = Math.min(1, LOGO_MAX_WIDTH_PX / image.naturalWidth);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
    const png = canvas.toDataURL("image/png");
    if (png.length <= MAX_LOGO_DATA_URL_CHARS) return png;
    const webp = canvas.toDataURL("image/webp", 0.88);
    if (webp.startsWith("data:image/webp") && webp.length <= MAX_LOGO_DATA_URL_CHARS) return webp;
    throw new Error("Loggan är för stor — prova en mindre bild");
  } finally {
    URL.revokeObjectURL(url);
  }
}

type Field = Exclude<keyof CompanyProfile, "logo">;

export function CompanyForm({ profile }: { profile: CompanyProfile }) {
  const [draft, setDraft] = useState<CompanyProfile>(profile);
  const [url, setUrl] = useState(profile.website);
  const [logoOptions, setLogoOptions] = useState<string[]>([]);
  const [colorOptions, setColorOptions] = useState<string[]>([]);
  const [scrapeNote, setScrapeNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [scraping, startScrape] = useTransition();
  const [saving, startSave] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  const set = (field: Field, value: string) => setDraft((d) => ({ ...d, [field]: value }));
  const input = (field: Field) => ({
    value: draft[field],
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(field, event.target.value),
  });

  const scrape = () => {
    setScrapeNote(null);
    startScrape(async () => {
      const result = await scrapeCompanyAction(url);
      if (!result.ok) {
        setScrapeNote({ ok: false, text: result.error });
        return;
      }
      const { found } = result;
      const [primary, accent] = found.colors;
      setDraft((d) => ({
        ...d,
        name: found.name ?? d.name,
        tagline: found.tagline ?? d.tagline,
        website: found.website,
        email: found.contacts.email ?? d.email,
        phone: found.contacts.phone ?? d.phone,
        orgNumber: found.contacts.orgNumber ?? d.orgNumber,
        address: found.contacts.address ?? d.address,
        logo: found.logoOptions[0] ?? d.logo,
        primaryColor: primary ?? d.primaryColor,
        accentColor: accent ?? d.accentColor,
      }));
      setLogoOptions(found.logoOptions);
      setColorOptions(found.colors.slice(0, 8));
      const missing = [
        !found.logoOptions.length && "logga",
        !found.contacts.orgNumber && "org.nr",
        !found.contacts.address && "adress",
        !found.contacts.phone && "telefon",
      ].filter(Boolean);
      setScrapeNote({
        ok: true,
        text: missing.length
          ? `Klart — kontrollera uppgifterna. Hittade inte: ${missing.join(", ")}.`
          : "Klart — kontrollera uppgifterna och spara.",
      });
    });
  };

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const logo = await fileToLogo(file);
      setDraft((d) => ({ ...d, logo }));
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "Loggan kunde inte läsas" });
    }
  };

  const save = () => {
    setMessage(null);
    startSave(async () => {
      const result = await saveCompanyProfileAction(draft);
      setMessage(result.ok ? { ok: true, text: "Sparat — nya offerter får de här uppgifterna" } : { ok: false, text: result.error });
    });
  };

  return (
    <div className={styles.companyLayout}>
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <section className={styles.panel}>
          <h2 className={styles.sectionTitle}>Hämta från hemsidan</h2>
          <p className={styles.muted}>Vi läser logga, färger och kontaktuppgifter. Inget sparas förrän du trycker Spara.</p>
          <div className={styles.scrapeRow}>
            <input
              className={styles.input}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="dittforetag.se"
              aria-label="Hemsida att hämta från"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  scrape();
                }
              }}
            />
            <button type="button" className="btn btn--primary" disabled={scraping || url.trim().length < 4} onClick={scrape}>
              {scraping ? "Läser sidan…" : "Hämta uppgifter"}
            </button>
          </div>
          {scraping && <p className={styles.muted}>Det tar oftast 10–30 sekunder.</p>}
          {scrapeNote && (
            <p className={scrapeNote.ok ? styles.success : styles.error} role="status">
              {scrapeNote.text}
            </p>
          )}
        </section>

        <section className={styles.panel}>
          <h2 className={styles.sectionTitle}>Företaget</h2>
          <div className={styles.formGrid} style={{ marginTop: "var(--space-3)" }}>
            <label className={styles.formRow}>
              <span className={styles.formLabel}>Företagsnamn *</span>
              <input className={styles.input} required maxLength={120} {...input("name")} />
            </label>
            <label className={styles.formRow}>
              <span className={styles.formLabel}>Undertitel</span>
              <input className={styles.input} maxLength={120} placeholder="Profilprodukter i Göteborg" {...input("tagline")} />
            </label>
            <label className={styles.formRow}>
              <span className={styles.formLabel}>Org.nr</span>
              <input className={styles.input} maxLength={20} placeholder="556123-4567" {...input("orgNumber")} />
            </label>
            <label className={styles.formRow}>
              <span className={styles.formLabel}>E-post</span>
              <input className={styles.input} type="email" maxLength={200} {...input("email")} />
            </label>
            <label className={styles.formRow}>
              <span className={styles.formLabel}>Telefon</span>
              <input className={styles.input} type="tel" maxLength={40} {...input("phone")} />
            </label>
            <label className={styles.formRow}>
              <span className={styles.formLabel}>Hemsida</span>
              <input className={styles.input} maxLength={200} {...input("website")} />
            </label>
            <label className={styles.formRow}>
              <span className={styles.formLabel}>Bankgiro</span>
              <input className={styles.input} maxLength={20} placeholder="123-4567" {...input("bankgiro")} />
            </label>
            <label className={`${styles.formRow} ${styles.formWide}`}>
              <span className={styles.formLabel}>Adress</span>
              <textarea className={styles.input} rows={2} maxLength={300} {...input("address")} />
            </label>
          </div>
        </section>

        <section className={styles.panel}>
          <h2 className={styles.sectionTitle}>Logga och färger</h2>
          <div className={styles.logoRow}>
            <div className={styles.logoFrame}>
              {draft.logo ? (
                // eslint-disable-next-line @next/next/no-img-element -- data-URL, inget att optimera
                <img src={draft.logo} alt="Din logga" />
              ) : (
                <span className={styles.muted}>Ingen logga</span>
              )}
            </div>
            <div className={styles.form}>
              <div className={styles.actionBar}>
                <button type="button" className={styles.ghostButton} onClick={() => fileInput.current?.click()}>
                  Ladda upp logga
                </button>
                {draft.logo && (
                  <button type="button" className={styles.ghostButton} onClick={() => setDraft((d) => ({ ...d, logo: null }))}>
                    Ta bort
                  </button>
                )}
                <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden onChange={upload} />
              </div>
              {logoOptions.length > 1 && (
                <div className={styles.logoOptions} role="radiogroup" aria-label="Loggor från hemsidan">
                  {logoOptions.map((logo, i) => (
                    <button
                      key={i}
                      type="button"
                      role="radio"
                      aria-checked={draft.logo === logo}
                      aria-label={`Logga ${i + 1}`}
                      onClick={() => setDraft((d) => ({ ...d, logo }))}
                    >
                      <LogoThumb src={logo} plate={darkPlate(draft.primaryColor)} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className={styles.colorFields}>
            {(
              [
                ["primaryColor", "Huvudfärg", "Rubriker, summa och godkänn-knappen"],
                ["accentColor", "Accentfärg", "Bocklistan och detaljer"],
              ] as const
            ).map(([field, label, hint]) => (
              <div key={field} className={styles.formRow}>
                <span className={styles.formLabel}>{label}</span>
                <div className={styles.colorInput}>
                  <input
                    type="color"
                    value={isHexColor(draft[field]) ? draft[field] : "#000000"}
                    onChange={(e) => set(field, e.target.value)}
                    aria-label={`${label}, väljare`}
                  />
                  <input className={styles.input} value={draft[field]} maxLength={7} onChange={(e) => set(field, e.target.value)} aria-label={label} />
                </div>
                <span className={styles.muted}>{hint}</span>
                {colorOptions.length > 0 && (
                  <div className={styles.swatches}>
                    {colorOptions.map((color) => (
                      <button
                        key={color}
                        type="button"
                        style={{ background: color }}
                        aria-label={`Använd ${color} som ${label.toLowerCase()}`}
                        aria-pressed={draft[field] === color}
                        onClick={() => set(field, color)}
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        <section className={styles.panel}>
          <h2 className={styles.sectionTitle}>Offertens villkor</h2>
          <label className={styles.formRow} style={{ marginTop: "var(--space-3)" }}>
            <span className={styles.formLabel}>Står i offertens sidfot</span>
            <textarea
              className={styles.input}
              rows={3}
              maxLength={500}
              placeholder="Betalning 30 dagar netto. Priser exkl. frakt."
              {...input("quoteTerms")}
            />
          </label>
        </section>

        <div className={styles.actionBar}>
          <button type="submit" className="btn btn--primary" disabled={saving}>
            {saving ? "Sparar…" : "Spara uppgifter"}
          </button>
          {message && (
            <span className={message.ok ? styles.success : styles.error} role="status">
              {message.text}
            </span>
          )}
        </div>
      </form>

      <QuotePreview profile={draft} />
    </div>
  );
}

/** Så här ser offertens överdel ut med uppgifterna — uppdateras medan du skriver. */
function LogoThumb({ src, plate }: { src: string; plate: string }) {
  const light = useLightLogo(src);
  // eslint-disable-next-line @next/next/no-img-element -- data-URL
  return <img src={src} alt="" style={light ? { background: plate, borderRadius: 6, padding: 4 } : undefined} />;
}

function QuotePreview({ profile }: { profile: CompanyProfile }) {
  const primary = isHexColor(profile.primaryColor) ? profile.primaryColor : "#0b1f3a";
  const lightLogo = useLightLogo(profile.logo);
  const accent = isHexColor(profile.accentColor) ? profile.accentColor : "#0b7a4b";
  return (
    <aside className={styles.previewSticky} aria-label="Förhandsvisning av offerten">
      <p className={styles.eyebrow}>Förhandsvisning</p>
      <div className={styles.quotePreview}>
        <div className={styles.qpTop}>
          {profile.logo ? (
            // eslint-disable-next-line @next/next/no-img-element -- data-URL
            <img
              src={profile.logo}
              alt=""
              className={styles.qpLogo}
              style={lightLogo ? { background: darkPlate(primary), padding: "6px 10px", borderRadius: 8 } : undefined}
            />
          ) : (
            <strong>{profile.name || "Ditt företag"}</strong>
          )}
          <span className={styles.qpRef}>
            Offert<b style={{ color: primary }}>OF-1024</b>
          </span>
        </div>
        <p className={styles.qpEyebrow}>Offert</p>
        <p className={styles.qpTitle} style={{ color: primary }}>
          Namnskyltar till Hotell Kronan
        </p>
        <div className={styles.qpTotal} style={{ borderColor: primary, color: primary }}>
          <span>Totalt exkl. moms</span>
          <span>1 240 kr</span>
        </div>
        <div className={styles.qpPromise}>
          {["Korrektur innan gravyr", "Svensk tillverkning"].map((p) => (
            <span key={p}>
              <i style={{ color: accent }}>✓</i> {p}
            </span>
          ))}
        </div>
        <div className={styles.qpAccept} style={{ background: primary, color: readableOn(primary) }}>
          <b>Godkänn offerten</b> — ett klick så går skyltarna till gravyren.
        </div>
        <div className={styles.qpFoot}>
          <span>{[profile.name, profile.orgNumber && `Org.nr ${profile.orgNumber}`].filter(Boolean).join(" · ")}</span>
          <span>{[profile.phone, profile.email, profile.website].filter(Boolean).join(" · ")}</span>
        </div>
      </div>
    </aside>
  );
}
