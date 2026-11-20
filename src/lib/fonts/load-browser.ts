import { CORE_FONT_FILES, FALLBACK_FILES, fontFileOf, type FontFile, type FontFileKey } from "./font-files";
import type { LoadedFontEngine } from "./font-engine";

let pending: Promise<LoadedFontEngine> | null = null;
let fallback: Promise<boolean> | null = null;
/** Filer som har begärts, så att samma fil aldrig hämtas två gånger. */
const requested = new Set<FontFileKey>();
/** De som ska få veta att en rad behöver ritas om, eftersom dess typsnitt har kommit. */
const listeners = new Set<() => void>();

async function fetchFonts(files: readonly FontFile[]): Promise<Map<FontFileKey, ArrayBuffer>> {
  const entries = await Promise.all(
    files.map(async ({ key, file }) => {
      const response = await fetch(`/fonts/${file}`);
      if (!response.ok) throw new Error(`Kunde inte hämta ${file}: ${response.status}`);
      return [key, await response.arrayBuffer()] as [FontFileKey, ArrayBuffer];
    }),
  );
  return new Map(entries);
}

/**
 * Hämtar ett typsnitt som en rad behöver, i bakgrunden. Raden ritas i grundtypsnittet så länge,
 * och de som lyssnar får veta när filen har kommit. Går filen inte att hämta står raden kvar i
 * grundtypsnittet, och ett nytt försök görs nästa gång sidan laddas.
 */
function fetchMissing(key: FontFileKey): void {
  if (requested.has(key) || !pending) return;
  const file = fontFileOf(key);
  if (!file) return;
  requested.add(key);
  void Promise.all([pending, fetchFonts([{ key, file }])])
    .then(([engine, buffers]) => {
      if (engine.addFonts(buffers)) for (const listener of listeners) listener();
    })
    .catch((error: unknown) => console.error(`Typsnittet ${key} kunde inte laddas`, error));
}

/**
 * Hämtar verkstadens typsnitt en gång per sidladdning. Parsern (opentype.js) laddas dynamiskt,
 * parallellt med filerna, så den inte tynger första sidladdningen. Reservtypsnittet hämtas för
 * sig, se `loadBrowserFallbackFonts`, och övriga typsnitt när en rad behöver dem.
 */
export function loadBrowserFontEngine(): Promise<LoadedFontEngine> {
  pending ??= Promise.all([import("./font-engine"), fetchFonts(CORE_FONT_FILES)])
    .then(([{ createFontEngine }, buffers]) => createFontEngine(buffers, { onMissing: fetchMissing }))
    .catch((error: unknown) => {
      pending = null;
      throw error;
    });
  return pending;
}

/** Anropas när ett typsnitt som en rad väntade på har kommit. Svarar med funktionen som slutar lyssna. */
export function onBrowserFontsChanged(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/**
 * Hämtar reservtypsnittet i bakgrunden och lägger det i motorn. Svarar `true`
 * när någon rad redan har ritats utan det och behöver ritas om. Ett fel här
 * stoppar ingenting: en rad med ett ovanligt tecken ritas då i sitt eget typsnitt.
 */
export function loadBrowserFallbackFonts(): Promise<boolean> {
  fallback ??= Promise.all([loadBrowserFontEngine(), fetchFonts(FALLBACK_FILES)])
    .then(([engine, buffers]) => engine.addFonts(buffers))
    .catch((error: unknown) => {
      fallback = null;
      console.error("Reservtypsnittet kunde inte laddas", error);
      return false;
    });
  return fallback;
}
