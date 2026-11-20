"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ORDER_LIST_FILTERS, ORDER_LIST_STATUS_LABEL, type OrderListFilter } from "@/lib/orders/list-status";
import styles from "./admin.module.css";

interface OrderFiltersProps {
  counts: Record<OrderListFilter, number>;
  /** Det valda filtret. `null` = alla ordrar visas. */
  active: OrderListFilter | null;
  query: string;
}

/**
 * Sökning och filter ligger i adressen, så att en filtrerad vy går att länka och laddas om.
 * Filtren är två, I produktion och Skickad (besked via ägaren 2026-11-20). Inget är valt från
 * början, och då visas alla ordrar. Ett klick på det valda filtret tar bort det igen.
 */
export function OrderFilters({ counts, active, query }: OrderFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [text, setText] = useState(query);

  const go = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
  };

  useEffect(() => {
    if (text === query) return;
    const timer = window.setTimeout(() => go({ q: text.trim() || null }), 220);
    return () => window.clearTimeout(timer);
  });

  return (
    <div className={styles.toolbar}>
      <label className={styles.search}>
        <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
          <circle cx="9" cy="9" r="6" />
          <path d="M14 14l4 4" />
        </svg>
        <span className="visually-hidden">Sök</span>
        <input
          type="search"
          value={text}
          placeholder="Sök order, kund eller namn på skylten…"
          onChange={(event) => setText(event.target.value)}
        />
      </label>
      <div className={styles.filters} role="group" aria-label="Status">
        {ORDER_LIST_FILTERS.map((filter) => (
          <button
            key={filter}
            type="button"
            className={styles.filter}
            data-filter={filter}
            aria-pressed={active === filter}
            onClick={() => go({ status: active === filter ? null : filter })}
          >
            {ORDER_LIST_STATUS_LABEL[filter]}
            <span className={styles.filterCount}>{counts[filter]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
