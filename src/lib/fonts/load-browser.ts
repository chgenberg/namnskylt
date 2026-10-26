import type { FontEngine } from "@/engine";
import { FONT_FILES, type FontFileKey } from "./font-files";

let pending: Promise<FontEngine> | null = null;

/**
 * Hämtar alla fontfiler en gång per sidladdning. Parsern (opentype.js) laddas
 * dynamiskt, parallellt med filerna, så den inte tynger första sidladdningen.
 */
export function loadBrowserFontEngine(): Promise<FontEngine> {
  pending ??= Promise.all([
    import("./font-engine"),
    ...FONT_FILES.map(async ({ key, file }) => {
      const response = await fetch(`/fonts/${file}`);
      if (!response.ok) throw new Error(`Kunde inte hämta ${file}: ${response.status}`);
      return [key, await response.arrayBuffer()] as [FontFileKey, ArrayBuffer];
    }),
  ])
    .then(([{ createFontEngine }, ...entries]) => createFontEngine(new Map(entries)))
    .catch((error: unknown) => {
      pending = null;
      throw error;
    });
  return pending;
}
