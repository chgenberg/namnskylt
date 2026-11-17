import { FALLBACK_FILES, FONT_FILES, type FontFile, type FontFileKey } from "./font-files";
import type { LoadedFontEngine } from "./font-engine";

let pending: Promise<LoadedFontEngine> | null = null;
let fallback: Promise<boolean> | null = null;

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
 * Hämtar fontfilerna skylten ritas med en gång per sidladdning. Parsern
 * (opentype.js) laddas dynamiskt, parallellt med filerna, så den inte tynger
 * första sidladdningen. Reservtypsnittet hämtas för sig, se `loadBrowserFallbackFonts`.
 */
export function loadBrowserFontEngine(): Promise<LoadedFontEngine> {
  pending ??= Promise.all([import("./font-engine"), fetchFonts(FONT_FILES)])
    .then(([{ createFontEngine }, buffers]) => createFontEngine(buffers))
    .catch((error: unknown) => {
      pending = null;
      throw error;
    });
  return pending;
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
