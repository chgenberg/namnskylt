"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BadgeDocument } from "@/engine";
import {
  isSaveable,
  isWorthSaving,
  packSavedWork,
  readSavedWork,
  restoredWork,
  type RestoredWork,
  type SavedWork,
} from "@/lib/designer-work/model";

/** Så länge väntar sparandet efter senaste ändringen, så att varje tangenttryckning inte skrivs. */
const SAVE_DELAY_MS = 300;

/** `localStorage` kan saknas eller vara avstängt, till exempel i en inbäddad butik. Då fungerar skyltmotorn som utan lagring. */
function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function forget(key: string): void {
  try {
    storage()?.removeItem(key);
  } catch {
    // Går det inte att ta bort finns det inget mer att göra.
  }
}

/**
 * Skriver arbetet. Får det inte plats tas det sparade bort helt: hellre
 * ingenting tillbaka än en halv varukorg som kunden kunde tro var hela ordern.
 * En skylt som är ogiltig mitt i en ändring sparas inte; det senast sparade
 * ligger då kvar.
 */
function write(key: string, work: SavedWork): void {
  if (!isWorthSaving(work)) return forget(key);
  if (!isSaveable(work)) return;
  try {
    storage()?.setItem(key, packSavedWork(work, Date.now()));
  } catch {
    forget(key);
  }
}

interface UseSavedWorkOptions {
  /** Nyckeln i `localStorage` (`savedWorkKey`): en per sammanhang. */
  storageKey: string;
  /** Skylten skyltmotorn öppnades med när adressen bar en text eller en delad skylt, annars `null`. */
  incoming: BadgeDocument | null;
  /** Arbetet som det är just nu. */
  work: SavedWork;
  /** Lägger det sparade i skyltmotorn. Anropas högst en gång, efter att sidan har monterats. */
  onRestore: (restored: RestoredWork) => void;
  /**
   * Skyltmotorn öppnades med ett eget innehåll som ersätter det sparade, till
   * exempel en tidigare order för ändring. Det sparade läses då bara tillbaka
   * när det kommer från samma öppning, alltså när sidan har laddats om.
   */
  replaces?: boolean;
}

interface SavedWorkControls {
  /** Sant när det sparade har lästs. Före det vet sidan inte om kunden kommer tillbaka till ett påbörjat arbete. */
  ready: boolean;
  /** Vad som lästes tillbaka och som kunden ska få veta om; `null` när inget behöver sägas. */
  notice: RestoredWork["notice"];
  dismiss: () => void;
  /** Ordern är lagd: det sparade tas bort, och inget mer sparas förrän `restart` anropas eller sidan öppnas igen. */
  finish: () => void;
  /** Kunden har börjat på något nytt efter en lagd order: arbetet sparas igen. */
  restart: () => void;
}

/**
 * Sparar skyltmotorns arbete i webbläsaren och läser tillbaka det när sidan
 * öppnas igen, så att varukorgen överlever en omladdning. Läsningen görs
 * efter att sidan har monterats, så att servern och webbläsaren ritar samma
 * sida först.
 */
export function useSavedWork({ storageKey, incoming, work, onRestore, replaces = false }: UseSavedWorkOptions): SavedWorkControls {
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState<RestoredWork["notice"]>(null);
  // Skylten sidan öppnades med: senare ändringar i editorn ska inte räknas som adressens skylt.
  const opening = useRef({ incoming, opened: work.opened, replaces });
  const restore = useRef(onRestore);
  const latest = useRef(work);
  const finished = useRef(false);

  useEffect(() => {
    restore.current = onRestore;
    latest.current = work;
  });

  useEffect(() => {
    let raw: string | null = null;
    try {
      raw = storage()?.getItem(storageKey) ?? null;
    } catch {
      raw = null;
    }
    const saved = readSavedWork(raw, Date.now());
    // Trasigt eller för gammalt: ta bort det, så att det inte läses om varje gång.
    if (raw && !saved) forget(storageKey);
    const sameOpening = saved?.opened === opening.current.opened;
    const restored = saved && (!opening.current.replaces || sameOpening) ? restoredWork(saved, opening.current.incoming, opening.current.opened) : null;
    if (restored) {
      restore.current(restored);
      setNotice(restored.notice);
    }
    setReady(true);
  }, [storageKey]);

  // Sparar en stund efter senaste ändringen, och direkt när sidan lämnas.
  useEffect(() => {
    if (!ready || finished.current) return;
    const timer = window.setTimeout(() => {
      if (!finished.current) write(storageKey, work);
    }, SAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [ready, storageKey, work]);

  useEffect(() => {
    if (!ready) return;
    const flush = () => {
      if (!finished.current) write(storageKey, latest.current);
    };
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, [ready, storageKey]);

  const dismiss = useCallback(() => setNotice(null), []);
  const finish = useCallback(() => {
    finished.current = true;
    forget(storageKey);
    setNotice(null);
  }, [storageKey]);

  const restart = useCallback(() => {
    finished.current = false;
  }, []);

  return { ready, notice, dismiss, finish, restart };
}
