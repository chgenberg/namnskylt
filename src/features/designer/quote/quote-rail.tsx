"use client";

import type { ReactNode } from "react";
import styles from "./quote.module.css";
import type { QuoteToggle } from "./use-quote";

/** Delarna säljaren kan lägga till och ta bort, i den ordning de står i dokumentet. */
const PARTS: { key: QuoteToggle; label: string; icon: ReactNode }[] = [
  {
    key: "logo",
    label: "Logga",
    icon: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="3" />
        <path d="M8 15l2.5-6 2.5 6M8.9 13h3.2M16 9v6" />
      </>
    ),
  },
  { key: "message", label: "Hälsning", icon: <path d="M4 5h16v11H9l-5 4z" /> },
  {
    key: "pictures",
    label: "Bilder",
    icon: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2.5" />
        <circle cx="8.5" cy="9.5" r="1.6" />
        <path d="M4 17l5-5 4 4 2.5-2.5L20 17" />
      </>
    ),
  },
  {
    key: "angles",
    label: "Vinklar",
    icon: (
      <>
        <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />
        <path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" />
      </>
    ),
  },
  {
    // En ritning per namn, när en design har flera namn.
    key: "badges",
    label: "Alla skyltar",
    icon: (
      <>
        <rect x="3" y="4" width="8" height="6" rx="1.5" />
        <rect x="13" y="4" width="8" height="6" rx="1.5" />
        <rect x="3" y="14" width="8" height="6" rx="1.5" />
        <rect x="13" y="14" width="8" height="6" rx="1.5" />
      </>
    ),
  },
  { key: "vat", label: "Moms", icon: <path d="M6 18L18 6M7.5 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM16.5 18a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z" /> },
  { key: "closing", label: "Avslutande text", icon: <path d="M4 7h16M4 12h16M4 17h9" /> },
  {
    key: "promises",
    label: "Löften",
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M8 12.5l2.8 2.8L16.5 9.5" />
      </>
    ),
  },
  {
    key: "accept",
    label: "Svarsruta",
    icon: (
      <>
        <rect x="3" y="7" width="18" height="10" rx="3" />
        <path d="M7.5 12.5l2 2 3.5-4" />
      </>
    ),
  },
  {
    key: "terms",
    label: "Villkor",
    icon: (
      <>
        <path d="M7 3h7l5 5v13H7z" />
        <path d="M14 3v5h5M10 13h6M10 17h6" />
      </>
    ),
  },
  {
    key: "seller",
    label: "Våra uppgifter",
    icon: (
      <>
        <path d="M4 20V9l8-5 8 5v11" />
        <path d="M9 20v-6h6v6" />
      </>
    ),
  },
  {
    // Filmerna står inte i dokumentet: de laddas ner bredvid PDF:en, en per skylt.
    key: "film",
    label: "3D-film till mejlet",
    icon: (
      <>
        <rect x="3" y="6" width="13" height="12" rx="2.5" />
        <path d="M16 10.5l5-3v9l-5-3z" />
      </>
    ),
  },
];

interface QuoteRailProps {
  elements: Record<QuoteToggle, boolean>;
  onToggle: (key: QuoteToggle) => void;
  disabled?: boolean;
}

/**
 * Ikonraden till vänster om offerten (beslut av ägaren 2026-11-19, efter Merchins offert):
 * varje ikon lägger till eller tar bort en del av dokumentet. De små bilderna hör till
 * bilderna och går inte att slå på utan dem.
 */
export function QuoteRail({ elements, onToggle, disabled = false }: QuoteRailProps) {
  return (
    <div className={styles.rail} role="toolbar" aria-label="Delar i offerten" aria-orientation="vertical">
      {PARTS.map(({ key, label, icon }) => {
        const on = elements[key];
        return (
          <button
            key={key}
            type="button"
            className={styles.railButton}
            aria-pressed={on}
            aria-label={label}
            title={`${on ? "Ta bort" : "Lägg till"}: ${label.toLowerCase()}`}
            data-label={label}
            disabled={disabled || (key === "angles" && !elements.pictures)}
            onClick={() => onToggle(key)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              {icon}
            </svg>
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
