"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import styles from "./admin.module.css";

/** Sökningen ligger i adressen, så att en filtrerad lista går att ladda om och länka. */
export function ShopSearch({ query, shown, total }: { query: string; shown: number; total: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const [text, setText] = useState(query);

  useEffect(() => {
    if (text.trim() === query) return;
    const timer = window.setTimeout(() => {
      const q = text.trim();
      router.replace(q ? `${pathname}?q=${encodeURIComponent(q)}` : pathname, { scroll: false });
    }, 220);
    return () => window.clearTimeout(timer);
  });

  return (
    <div className={styles.toolbar}>
      <label className={styles.search}>
        <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
          <circle cx="9" cy="9" r="6" />
          <path d="M14 14l4 4" />
        </svg>
        <span className="visually-hidden">Sök butik</span>
        <input
          type="search"
          value={text}
          placeholder="Sök butik på namn, hemsida eller länk…"
          onChange={(event) => setText(event.target.value)}
        />
      </label>
      <span className={styles.muted}>{query ? `${shown} av ${total} butiker` : `${total} butiker`}</span>
    </div>
  );
}
