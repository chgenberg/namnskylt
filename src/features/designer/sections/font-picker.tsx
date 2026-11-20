"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { FONTS, FONT_CATEGORIES, getFont, type BadgeFont, type FontId } from "@/engine";
import styles from "./font-picker.module.css";

interface FontPickerProps {
  value: FontId;
  onChange: (font: FontId) => void;
}

/** Typsnitt vars fil har begärts för listans förhandsvisning, så att ingen fil hämtas två gånger. */
const previews = new Map<FontId, Promise<string | null>>();

const previewFamily = (id: FontId) => `ns-typsnitt-${id}`;

/**
 * Hämtar typsnittet till listans förhandsvisning och svarar med dess familjenamn, eller `null` när
 * filen inte går att hämta. Namnet i listan står då i ett liknande typsnitt, och valet fungerar ändå:
 * skylten ritas av motorn, som hämtar samma fil för sig.
 */
function loadPreview(font: BadgeFont): Promise<string | null> {
  const known = previews.get(font.id);
  if (known) return known;
  const family = previewFamily(font.id);
  const face = new FontFace(family, `url(/fonts/${font.files.regular})`);
  const pending = face.load().then(
    () => {
      document.fonts.add(face);
      return family;
    },
    () => null,
  );
  previews.set(font.id, pending);
  return pending;
}

/** Visar elementets text i typsnittet, när det har hämtats. */
function showIn(element: HTMLElement, font: BadgeFont) {
  void loadPreview(font).then((family) => {
    if (family) element.style.setProperty("--preview-font", `'${family}', ${font.css}`);
  });
}

/**
 * Typsnittsväljaren: en knapp med det valda typsnittet, som öppnar en rullista med sökruta
 * (besked via ägaren 2026-11-20: "scrollist som man har i typ Word"). Varje namn står i sitt eget
 * typsnitt. Filerna hämtas först när raden rullas fram, eftersom typsnitten är många.
 */
export function FontPicker({ value, onChange }: FontPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const listId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef<HTMLSpanElement>(null);
  const current = getFont(value);

  const groups = useMemo(() => {
    const wanted = query.trim().toLowerCase();
    return FONT_CATEGORIES.map((category) => ({
      ...category,
      fonts: FONTS.filter((font) => font.category === category.id && (!wanted || font.name.toLowerCase().includes(wanted))),
    })).filter((group) => group.fonts.length > 0);
  }, [query]);

  useEffect(() => {
    if (currentRef.current) showIn(currentRef.current, current);
  }, [current]);

  // Raderna får sitt typsnitt när de rullas fram i listan, inte alla på en gång.
  useEffect(() => {
    const list = listRef.current;
    if (!open || !list) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const element = entry.target as HTMLElement;
          const font = FONTS.find((candidate) => candidate.id === element.dataset.font);
          if (font) showIn(element, font);
          observer.unobserve(element);
        }
      },
      { root: list, rootMargin: "120px 0px" },
    );
    for (const element of list.querySelectorAll<HTMLElement>("[data-font]")) observer.observe(element);
    return () => observer.disconnect();
  }, [open, groups]);

  // Listan öppnas med det valda typsnittet i sikte. Bara listan rullas, aldrig sidan.
  useEffect(() => {
    const list = listRef.current;
    const checked = open ? list?.querySelector<HTMLElement>('[aria-checked="true"]') : null;
    if (list && checked) list.scrollTop = Math.max(0, checked.offsetTop - list.clientHeight / 2);
  }, [open]);

  return (
    <div className={styles.picker}>
      <span className={styles.label}>Typsnitt</span>
      <button type="button" className={styles.current} aria-expanded={open} aria-controls={listId} onClick={() => setOpen((was) => !was)}>
        <span ref={currentRef} className={styles.sample}>
          {current.name}
        </span>
        <span className={styles.more}>{open ? "Stäng" : `Byt, ${FONTS.length} st`}</span>
        <svg className={styles.chevron} viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <path d="M3.5 6l4.5 4.5L12.5 6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div id={listId} className={styles.panel}>
          <label className={`field ${styles.search}`}>
            <input
              type="search"
              value={query}
              placeholder={`Sök bland ${FONTS.length} typsnitt`}
              aria-label="Sök typsnitt"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <div ref={listRef} className={styles.list} role="radiogroup" aria-label="Typsnitt">
            {groups.length === 0 && <p className={styles.empty}>Inget typsnitt heter så.</p>}
            {groups.map((group) => (
              <div key={group.id} className={styles.group}>
                <p className={styles.groupName}>{group.name}</p>
                {group.fonts.map((font) => (
                  <button
                    key={font.id}
                    type="button"
                    role="radio"
                    aria-checked={font.id === value}
                    className={styles.option}
                    data-font={font.id}
                    onClick={() => onChange(font.id)}
                  >
                    {font.name}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
