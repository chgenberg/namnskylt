"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import styles from "./quote.module.css";

/** A4 i skärmpunkter: dokumentet ritas i sin riktiga bredd och krymps till ytan. */
const PAGE_WIDTH_PX = 794;

/** Stilen som bara gäller förhandsvisningen: sidan nollställs mot sajtens stil och krymps till ytan. */
const FRAME_CSS = ":host{all:initial;display:block}#zoom{zoom:var(--quote-zoom,1)}";

interface QuoteSheetProps {
  /** Offertens dokument: samma stil och innehåll som PDF:en ritas ur. */
  markup: { css: string; body: string };
  /** Säljaren har skrivit om en text direkt i dokumentet. */
  onEdit: (field: string, text: string) => void;
  /** Säljaren har klickat på något som ändras i panelen, till exempel kunden. */
  onJump: (field: string) => void;
  /** Offerten är sparad: dokumentet visas men går inte att ändra. */
  locked?: boolean;
}

/**
 * Offerten som den ser ut, på skyltens plats i skyltmotorn (beslut av ägaren 2026-11-19).
 * Dokumentet är samma som PDF:en ritas ur (`quoteDocument`), lagt i en egen skuggrot så att
 * sajtens stil inte når det. Rubriken, hälsningen och den avslutande texten ändras genom att
 * klicka och skriva i dokumentet, som i Merchins offert; ändringen sparas när fältet lämnas.
 */
export function QuoteSheet({ markup, onEdit, onJump, locked = false }: QuoteSheetProps) {
  const fitRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  /** Dokumentet som ska visas, och det som ligger i sidan. De skiljer sig medan säljaren skriver. */
  const latest = useRef("");
  const applied = useRef<string | null>(null);
  const handlers = useRef({ onEdit, onJump });
  handlers.current = { onEdit, onJump };

  useEffect(() => {
    const fit = fitRef.current;
    if (!fit) return;
    const measure = () => setScale(Math.min(1, fit.clientWidth / PAGE_WIDTH_PX));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(fit);
    return () => observer.disconnect();
  }, []);

  // Skuggroten och dess lyssnare skapas en gång. Innehållet byts i effekten under.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const root = host.shadowRoot ?? host.attachShadow({ mode: "open" });
    // Säljaren skriver i en text i dokumentet, eller i marginalfältet: då får dokumentet inte bytas under händerna.
    const editing = () => Boolean(root.activeElement?.matches("[data-edit], [data-input]"));
    const show = () => {
      if (editing() || applied.current === latest.current) return;
      root.innerHTML = latest.current;
      applied.current = latest.current;
    };
    /** Ändringen ångras med Escape: fältet lämnas utan att texten sparas. */
    let reverted = false;
    const fieldOf = (event: Event) => (event.target instanceof HTMLElement ? event.target.closest<HTMLElement>("[data-edit]") : null);
    const jumpOf = (event: Event) => (event.target instanceof HTMLElement ? event.target.closest<HTMLElement>("[data-jump]") : null);

    const onFocusOut = (event: Event) => {
      const field = fieldOf(event);
      if (!field) return;
      if (reverted) applied.current = null;
      else handlers.current.onEdit(field.dataset.edit ?? "", field.innerText.replace(/ /g, " "));
      reverted = false;
      // Det som har hänt medan fältet var öppet, eller texten som ångrades, ritas nu.
      window.setTimeout(show, 0);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const field = fieldOf(event);
      if (field) {
        if (event.key === "Escape") {
          reverted = true;
          field.blur();
        }
        // Rubriken är en rad. I de längre texterna är Enter en ny rad, och Ctrl eller Cmd + Enter sparar.
        if (event.key === "Enter" && (field.dataset.edit === "project" || event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          field.blur();
        }
        return;
      }
      if (event.target instanceof HTMLInputElement && event.target.dataset.input) {
        if (event.key === "Enter") event.target.blur();
        return;
      }
      const jump = jumpOf(event);
      if (jump && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        handlers.current.onJump(jump.dataset.jump ?? "");
      }
    };
    const onPaste = (event: ClipboardEvent) => {
      const field = fieldOf(event);
      if (!field) return;
      // Bara texten klistras in, aldrig formatering ur ett annat dokument.
      event.preventDefault();
      const text = event.clipboardData?.getData("text/plain") ?? "";
      document.execCommand("insertText", false, field.dataset.edit === "project" ? text.replace(/\s+/g, " ") : text);
    };
    const onClick = (event: Event) => {
      const jump = jumpOf(event);
      if (jump) handlers.current.onJump(jump.dataset.jump ?? "");
      // En knapp i säljarens egen ruta, till exempel "Återställ till listpris".
      const action = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>("[data-action]") : null;
      if (action) handlers.current.onEdit(action.dataset.action ?? "", "");
    };
    // Ett fält i säljarens egen ruta, till exempel marginalen: värdet gäller när fältet lämnas eller Enter trycks.
    const onChange = (event: Event) => {
      const input = event.target instanceof HTMLInputElement ? event.target : null;
      if (!input?.dataset.input) return;
      handlers.current.onEdit(input.dataset.input, input.value);
      window.setTimeout(show, 0);
    };
    root.addEventListener("focusout", onFocusOut);
    root.addEventListener("keydown", onKeyDown as EventListener);
    root.addEventListener("paste", onPaste as EventListener);
    root.addEventListener("click", onClick);
    root.addEventListener("change", onChange);
    // Lämnas marginalfältet utan ändring ska det som väntade ändå ritas.
    root.addEventListener("focusout", () => window.setTimeout(show, 0));
    show();
    return () => {
      root.removeEventListener("focusout", onFocusOut);
      root.removeEventListener("keydown", onKeyDown as EventListener);
      root.removeEventListener("paste", onPaste as EventListener);
      root.removeEventListener("click", onClick);
      root.removeEventListener("change", onChange);
    };
  }, []);

  // Dokumentet byts på plats, utan att sidan blinkar. Medan säljaren skriver i ett fält väntar bytet.
  useLayoutEffect(() => {
    latest.current = `<style>${FRAME_CSS}${markup.css}</style><div id="zoom">${markup.body}</div>`;
    const root = hostRef.current?.shadowRoot;
    if (!root || root.activeElement?.matches("[data-edit], [data-input]") || applied.current === latest.current) return;
    root.innerHTML = latest.current;
    applied.current = latest.current;
  }, [markup]);

  return (
    <div className={styles.sheet}>
      <div ref={fitRef} className={styles.sheetFit}>
        <div
          ref={hostRef}
          className={styles.paper}
          data-quote-document
          inert={locked}
          style={{ "--quote-zoom": scale || 1, visibility: scale ? "visible" : "hidden" } as CSSProperties}
        />
      </div>
    </div>
  );
}
