"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./designer.module.css";
import { PANEL_SECTIONS } from "./panel-steps";

/** Panelens sektioner i den ordning de står. Stegen är dem `PanelSection` bär i sina rubriker. */
const SECTIONS = PANEL_SECTIONS;
/** Sektionen som är markerad innan sidan har rullats: den första. */
const FIRST_STEP = 1;

function sectionOf(step: number): HTMLElement | null {
  return document.getElementById(`section-${step}`)?.closest("section") ?? null;
}

/**
 * Genvägar mellan panelens sektioner på telefon (besked av ägaren 2026-11-19: motorn ska vara
 * lika lätt att använda på mobil som på dator). Där är panelen en lång sida under skylten, och
 * raden står fast under den: ett tryck rullar fram sektionen, och den man står i är markerad.
 * På bredare skärmar visas raden inte (designer.module.css).
 */
export function SectionNav() {
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
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
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
    sectionOf(step)?.scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "start" });
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
