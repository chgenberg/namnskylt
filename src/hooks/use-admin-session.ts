"use client";

import { useSyncExternalStore } from "react";

/**
 * Mockad inloggning: ingen server, inget lösenord — bara en flagga i
 * webbläsaren så att adminvyn kan visas. Byts mot riktig auth innan något
 * känsligt (riktiga ordrar, kunddata) läggs bakom den.
 */
const STORAGE_KEY = "namnskylt-admin-session";
const CHANGE_EVENT = "namnskylt-admin-session";

export interface AdminSession {
  name: string;
}

function read(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function write(value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Privat läge utan lagring: sessionen gäller då bara tills sidan laddas om.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useAdminSession(): {
  session: AdminSession | null;
  /** `false` vid serverrendering, innan lagringen kunnat läsas. */
  ready: boolean;
  login: () => void;
  logout: () => void;
} {
  const name = useSyncExternalStore(subscribe, read, () => null);
  const ready = useSyncExternalStore(subscribe, () => true, () => false);
  return {
    session: name ? { name } : null,
    ready,
    login: () => write("Admin"),
    logout: () => write(null),
  };
}
