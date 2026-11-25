"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./designer.module.css";
import { PANEL_SECTIONS } from "./panel-steps";
import { revealInPanel } from "./reveal";

/** Panelens sektioner i den ordning de står. Stegen är dem `PanelSection` bär i sina rubriker. */
const SECTIONS = PANEL_SECTIONS;
/** Sektionen som är markerad innan sidan har rullats: den första. */
const FIRST_STEP = 1;

function sectionOf(step: number): HTMLElement | null {
  return document.getElementById(`section-${step}`)?.closest("section") ?? null;
}

/**
 * Genvägar mellan panelens sektioner på telefon (besked av ägaren 2026-11-19: motorn ska vara
 * lika lätt att använda på mobil som på dator). Raden står överst i bladet med valen (2026-11-24),
 * där den också är det man drar bladet i: ett tryck rullar fram sektionen, och den man står i är
 * markerad. I vyerna utan blad står raden fast under skylten, som förut. På bredare skärmar visas
 * raden inte (designer.module.css).
 */
interface SectionNavProps {
  /**
   * Bladet på telefon öppnas innan sektionen rullas fram. Sant när det öppnades: då väntar
   * rullningen tills bladet har fått sin höjd.
   */
  onBeforeGo?: () => boolean;
}

export function SectionNav({ onBeforeGo }: SectionNavProps = {}) {
  const navRef = useRef<HTMLElement>(null);
  const [active, setActive] = useState<number>(FIRST_STEP);

  useEffect(() => {
    let frame = 0;
    const read = () => {
      frame = 0;
      const nav = navRef.current;
      // Raden visas bara på telefon. Dold har den ingen ruta, och då finns inget att markera.
      if (!nav || nav.offsetParent === null) return;
      const line = nav.getBoundingClientRect().bottom + 12;
      let current: number = FIRST_STEP;
      for (const { step } of SECTIONS) {
        const section = sectionOf(step);
        if (section && section.getBoundingClientRect().top <= line) current = step;
      }
      setActive(current);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };
    read();
    // Fångat: i bladet på telefon är det bladet som rullar, inte sidan.
    window.addEventListener("scroll", schedule, { passive: true, capture: true });
    window.addEventListener("resize", schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule, { capture: true });
      window.removeEventListener("resize", schedule);
    };
  }, []);

  // Den markerade genvägen hålls i bild när raden är bredare än skärmen.
  useEffect(() => {
    const nav = navRef.current;
    const link = nav?.querySelector<HTMLElement>(`[data-step="${active}"]`);
    if (!nav || !link || nav.offsetParent === null) return;
    const left = link.offsetLeft - (nav.clientWidth - link.offsetWidth) / 2;
    nav.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
  }, [active]);

  const go = (step: number) => {
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const show = () => {
      const section = sectionOf(step);
      if (section) revealInPanel(section, calm ? "auto" : "smooth");
    };
    if (onBeforeGo?.()) requestAnimationFrame(() => requestAnimationFrame(show));
    else show();
  };

  return (
    <nav ref={navRef} className={styles.sectionNav} aria-label="Sektioner">
      {SECTIONS.map(({ step, label }) => (
        <button
          key={step}
          type="button"
          className={styles.sectionLink}
          data-step={step}
          aria-current={active === step ? "true" : undefined}
          onClick={() => go(step)}
        >
          {label}
        </button>
      ))}
    </nav>
  );
}
