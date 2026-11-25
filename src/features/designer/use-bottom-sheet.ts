"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { clampSheetHeight, nextSheetStop, snapSheet, type SheetHeights, type SheetStop } from "@/lib/bottom-sheet/stops";

/** Bladet används under den här bredden, där skylten och valen inte ryms bredvid varandra. */
const PHONE_QUERY = "(max-width: 699px)";
/** Så långt fingret ska flyttas innan ett tryck blir ett drag. */
const DRAG_START_PX = 6;
/** Det halva bladet tar så stor del av skyltmotorns höjd. Samma tal som `height` i designer.module.css. */
const HALF_SHARE = 0.55;
/** Det hela bladet stannar så här långt under skyltmotorns överkant. Samma som `--sheet-gap` där. */
const FULL_GAP_PX = 12;
/** Det lilla bladets höjd innan den har mätts: greppet, genvägarna och prisraden. */
const SMALL_FALLBACK_PX = 180;
/** Märket på historikens rad för ett öppet blad. Nexts eget läge ligger kvar bredvid. */
const SHEET_STATE_KEY = "namnskyltSheet";

/** Historikens rad hör till ett öppet blad. */
function sheetEntry(): boolean {
  return Boolean((window.history.state as Record<string, unknown> | null)?.[SHEET_STATE_KEY]);
}

/**
 * Ett öppet blad får en egen rad i historiken, utom när adressen bär en kopierad order (`igen`).
 * Den tas ur adressen när ordern är lagd, men bara ur raden som står då: under bladets rad låg
 * adressen kvar, och när bladet stängdes kom den tillbaka, så att en omladdning öppnade samma order
 * i varukorgen igen. Där stänger Tillbaka inte bladet, utan går som vanligt.
 */
function mayPushSheet(): boolean {
  return !new URL(window.location.href).searchParams.has("igen");
}

/** Telefon: skyltmotorns val ligger i ett blad. Läses efter första ritningen, så att servern och webbläsaren ritar lika. */
export function usePhoneLayout(): boolean {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const query = window.matchMedia(PHONE_QUERY);
    const read = () => setPhone(query.matches);
    read();
    query.addEventListener("change", read);
    return () => query.removeEventListener("change", read);
  }, []);
  return phone;
}

export interface BottomSheet {
  stop: SheetStop;
  dragging: boolean;
  shellRef: RefObject<HTMLDivElement | null>;
  sheetRef: RefObject<HTMLElement | null>;
  /** Öppnar bladet halvt när det är litet. Sant när det öppnades: den som rullar i bladet väntar då en bild. */
  ensureOpen: () => boolean;
  /** Ett tryck på greppet: litet, halvt, helt och tillbaka. */
  cycle: () => void;
  /** Greppet och genvägarna: där dras bladet. */
  onHandlePointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
}

/**
 * Bladet med valen på telefon (beslut av ägaren 2026-11-24, efter Merchin: "inställningarna i ett
 * blad som dras upp underifrån, i stället för en lång spalt under produkten"). Skylten står stor
 * överst, och bladet är litet (greppet, genvägarna och prisraden med Lägg i varukorgen), halvt
 * eller helt. Det dras i greppet eller genvägarna, och ett tryck på greppet stegar mellan lägena.
 * Escape och webbläsarens Tillbaka stänger det: ett öppnat blad lägger en rad i historiken utan ny
 * adress. Medan bladet dras står skylten still, och den ritas om först när bladet har stannat.
 */
export function useBottomSheet(active: boolean): BottomSheet {
  const [stop, setStopState] = useState<SheetStop>("small");
  const [dragging, setDragging] = useState(false);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const sheetRef = useRef<HTMLElement | null>(null);
  const stopRef = useRef<SheetStop>("small");
  const smallRef = useRef(SMALL_FALLBACK_PX);
  /** Bladet har lagt en rad i historiken, som Tillbaka tar bort. */
  const pushed = useRef(false);

  const activeRef = useRef(active);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  const setStop = useCallback((next: SheetStop) => {
    if (next !== "small" && !pushed.current && mayPushSheet()) {
      // Samma adress och Nexts eget läge: routern ser samma sida, och Tillbaka stänger bara bladet.
      window.history.pushState({ ...window.history.state, [SHEET_STATE_KEY]: true }, "");
      pushed.current = true;
    } else if (next === "small" && pushed.current) {
      pushed.current = false;
      window.history.back();
    }
    stopRef.current = next;
    setStopState(next);
  }, []);

  // Utan blad (en bredare skärm, eller vyerna På person och Offert) är bladet litet, och historiken som förut.
  useEffect(() => {
    if (!active && stopRef.current !== "small") setStop("small");
  }, [active, setStop]);

  /*
   * Historikens rad avgör om bladet är öppet. Tillbaka till en rad utan bladet stänger det, och en rad
   * med bladet öppnar det: Framåt in i den, eller Tillbaka hit från en sida kunden gick till med
   * bladet öppet. Annars blev raden kvar som ett tomt steg, där Tillbaka inte syntes göra något.
   */
  useEffect(() => {
    if (!active) return;
    const read = () => {
      const open = sheetEntry();
      pushed.current = open;
      const next: SheetStop = open ? (stopRef.current === "small" ? "half" : stopRef.current) : "small";
      stopRef.current = next;
      setStopState(next);
    };
    if (sheetEntry()) read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, [active]);

  // Escape stänger bladet, men inte när en ruta (varukorgen, stegrutan) är öppen över skyltmotorn.
  useEffect(() => {
    if (!active || stop === "small") return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || document.querySelector("dialog[open]")) return;
      setStop("small");
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [active, stop, setStop]);

  // Får ett fält i bladet markören när bladet är litet öppnas det, så att fältet syns.
  useEffect(() => {
    const sheet = sheetRef.current;
    if (!active || !sheet) return;
    const onFocus = (event: FocusEvent) => {
      if (stopRef.current !== "small" || !(event.target instanceof HTMLElement)) return;
      if (event.target.closest("[data-sheet-body]")) setStop("half");
    };
    sheet.addEventListener("focusin", onFocus);
    return () => sheet.removeEventListener("focusin", onFocus);
  }, [active, setStop]);

  // Sidan rullar inte medan bladet visas: allt som rullar finns i bladet.
  useEffect(() => {
    if (!active) return;
    const root = document.documentElement;
    root.setAttribute("data-designer-sheet", "");
    return () => root.removeAttribute("data-designer-sheet");
  }, [active]);

  // Det lilla bladets höjd mäts när det står litet, eftersom prisraden kan växa.
  useEffect(() => {
    if (active && stop === "small" && sheetRef.current) smallRef.current = sheetRef.current.offsetHeight || SMALL_FALLBACK_PX;
  });

  const ensureOpen = useCallback(() => {
    if (!active || stopRef.current !== "small") return false;
    setStop("half");
    return true;
  }, [active, setStop]);

  const cycle = useCallback(() => setStop(nextSheetStop(stopRef.current)), [setStop]);

  const onHandlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const sheet = sheetRef.current;
      const shell = shellRef.current;
      if (!active || !sheet || !shell || (event.pointerType === "mouse" && event.button !== 0)) return;
      const pointer = event.pointerId;
      const startY = event.clientY;
      const startHeight = sheet.getBoundingClientRect().height;
      const from = stopRef.current;
      const total = shell.clientHeight;
      const heights: SheetHeights = {
        small: Math.min(smallRef.current, total),
        half: Math.max(smallRef.current, total * HALF_SHARE),
        full: Math.max(smallRef.current, total - FULL_GAP_PX),
      };
      let moved = false;
      let last = { y: startY, at: event.timeStamp };
      let velocity = 0;
      const heightAt = (y: number) => clampSheetHeight(startHeight + startY - y, heights);

      const onMove = (move: PointerEvent) => {
        // Bara fingret som började draget räknas: med två fingrar på skärmen slutar inte det ena det andras drag.
        if (move.pointerId !== pointer) return;
        if (!moved && Math.abs(startY - move.clientY) < DRAG_START_PX) return;
        if (!moved) {
          moved = true;
          // Skylten står still medan bladet dras, och ritas om när det har stannat.
          const stage = shell.querySelector<HTMLElement>("[data-sheet-stage]");
          if (stage) shell.style.setProperty("--stage-frozen", `${stage.getBoundingClientRect().height}px`);
          setDragging(true);
        }
        const elapsed = move.timeStamp - last.at;
        if (elapsed > 0) velocity = (last.y - move.clientY) / elapsed;
        last = { y: move.clientY, at: move.timeStamp };
        shell.style.setProperty("--sheet-drag", `${heightAt(move.clientY)}px`);
      };
      const finish = (end: PointerEvent) => {
        if (end.pointerId !== pointer) return;
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", finish);
        window.removeEventListener("pointercancel", finish);
        if (!moved) return;
        // Webbläsaren tog över (ett svep i sidled på genvägarna), eller bladet finns inte längre:
        // bladet går tillbaka dit det var. Ett avbrutet drag har ingen pålitlig plats för fingret.
        if (end.type === "pointercancel" || !activeRef.current) {
          setDragging(false);
          if (activeRef.current) setStop(from);
          return;
        }
        // Draget slutar inte i ett klick på en genväg eller på greppet.
        const swallow = (click: Event) => {
          click.preventDefault();
          click.stopPropagation();
        };
        window.addEventListener("click", swallow, { capture: true, once: true });
        window.setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 300);
        setDragging(false);
        setStop(snapSheet({ from, height: heightAt(end.clientY), velocity, heights }));
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", finish);
      window.addEventListener("pointercancel", finish);
    },
    [active, setStop],
  );

  return { stop, dragging, shellRef, sheetRef, ensureOpen, cycle, onHandlePointerDown };
}
