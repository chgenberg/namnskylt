"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./admin.module.css";

interface EmailPreview {
  subject: string;
  preheader: string;
  html: string;
  text: string;
  to: string | null;
  from: string | null;
}

type View = "desktop" | "mobile" | "text";

const VIEW_LABEL: Record<View, string> = { desktop: "Dator", mobile: "Mobil", text: "Ren text" };

/** Så ser mejlet till en återförsäljare ut — med deras logga, färger och butik. */
export function ShopEmailPreview({ shops }: { shops: { slug: string; name: string }[] }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [slug, setSlug] = useState(shops[0]?.slug ?? "");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<View>("desktop");
  const [email, setEmail] = useState<EmailPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? shops.filter((s) => s.name.toLowerCase().includes(q) || s.slug.includes(q)).slice(0, 80) : shops.slice(0, 80);
  }, [query, shops]);

  useEffect(() => {
    if (!open || !slug) return;
    let active = true;
    setEmail(null);
    setError(null);
    fetch(`/api/admin/shops/${encodeURIComponent(slug)}/email`)
      .then((r) => (r.ok ? (r.json() as Promise<EmailPreview>) : Promise.reject(new Error())))
      .then((data) => active && setEmail(data))
      .catch(() => active && setError("Mejlet kunde inte visas."));
    return () => {
      active = false;
    };
  }, [open, slug]);

  if (shops.length === 0) return null;

  return (
    <>
      <button
        type="button"
        className="btn btn--primary"
        onClick={() => {
          setOpen(true);
          dialog.current?.showModal();
        }}
      >
        Förhandsvisa mejl
      </button>
      <dialog
        ref={dialog}
        className={`${styles.dialog} ${styles.mailDialog}`}
        aria-labelledby="mail-preview-title"
        onClose={() => setOpen(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) dialog.current?.close();
        }}
      >
        <div className={styles.mailLayout}>
          <aside className={styles.mailSide}>
            <div>
              <p className={styles.eyebrow}>Utskick via Resend</p>
              <h2 id="mail-preview-title" className={styles.dialogTitle}>
                Mejlet till återförsäljaren
              </h2>
            </div>
            <input
              className={styles.input}
              placeholder={`Sök bland ${shops.length} butiker…`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Sök butik"
            />
            <ul className={styles.mailShops} role="listbox" aria-label="Butiker">
              {matches.map((shop) => (
                <li key={shop.slug}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={shop.slug === slug}
                    onClick={() => setSlug(shop.slug)}
                  >
                    {shop.name}
                  </button>
                </li>
              ))}
            </ul>
          </aside>

          <section className={styles.mailMain}>
            <div className={styles.mailToolbar}>
              <div className={styles.filters} role="group" aria-label="Visning">
                {(Object.keys(VIEW_LABEL) as View[]).map((v) => (
                  <button key={v} type="button" className={styles.filter} aria-pressed={view === v} onClick={() => setView(v)}>
                    {VIEW_LABEL[v]}
                  </button>
                ))}
              </div>
              <button type="button" className={styles.ghostButton} onClick={() => dialog.current?.close()}>
                Stäng
              </button>
            </div>

            {email ? (
              <>
                <dl className={styles.mailHead}>
                  <dt>Från</dt>
                  <dd>{email.from ?? "Ställ in e-post under Inställningar"}</dd>
                  <dt>Till</dt>
                  <dd>{email.to ?? "E-post saknas för butiken"}</dd>
                  <dt>Ämne</dt>
                  <dd>
                    <strong>{email.subject}</strong>
                  </dd>
                  <dt>Inkorgen</dt>
                  <dd className={styles.muted}>{email.preheader}</dd>
                </dl>
                {view === "text" ? (
                  <pre className={styles.mailText}>{email.text}</pre>
                ) : (
                  <div className={styles.mailFrameWrap} data-view={view}>
                    <iframe
                      title="Mejlet"
                      srcDoc={email.html}
                      sandbox="allow-popups allow-popups-to-escape-sandbox"
                      className={styles.mailFrame}
                    />
                  </div>
                )}
              </>
            ) : (
              <p className={error ? styles.error : styles.muted} role="status">
                {error ?? "Bygger mejlet…"}
              </p>
            )}
          </section>
        </div>
      </dialog>
    </>
  );
}
