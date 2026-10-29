"use client";

import { useState, useTransition } from "react";
import { deleteShopAction } from "./shop-actions";
import styles from "./admin.module.css";

export function ShopCardActions({ slug, name, url }: { slug: string; name: string; url: string }) {
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <div className={styles.shopActions}>
      <a href={`/admin/butiker/${slug}`} className="btn btn--primary">
        Hantera
      </a>
      <a href={`/butik/${slug}`} target="_blank" rel="noreferrer" className={styles.ghostButton}>
        Öppna ↗
      </a>
      <button
        type="button"
        className={styles.ghostButton}
        onClick={async () => {
          await navigator.clipboard?.writeText(url).catch(() => undefined);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1800);
        }}
      >
        {copied ? "Kopierad ✓" : "Kopiera länk"}
      </button>
      <button
        type="button"
        className={styles.iconDanger}
        aria-label={`Ta bort butiken ${name}`}
        title="Ta bort butiken"
        disabled={pending}
        onClick={() => {
          if (!window.confirm(`Ta bort butiken för ${name}? Länken slutar fungera, ordrarna ligger kvar.`)) return;
          startTransition(async () => {
            await deleteShopAction(slug);
          });
        }}
      >
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2.5 4h11M6.5 4V2.5h3V4M4 4l.7 9.5h6.6L12 4M6.8 6.8v4.4M9.2 6.8v4.4" />
        </svg>
      </button>
    </div>
  );
}
