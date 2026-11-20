import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { FontEngine } from "@/engine";
import { createFontEngine } from "./font-engine";
import { CORE_FONT_FILES, FALLBACK_FILES, fontFileOf, type FontFileKey } from "./font-files";

let pending: Promise<FontEngine> | null = null;

function toArrayBuffer(data: Buffer): ArrayBuffer {
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
}

/**
 * Typsnittsmotorn för servern och testerna. Verkstadens typsnitt och reservtypsnittet läses
 * direkt från `public/fonts`. Övriga typsnitt läses först när en skylt ritas i dem: de är
 * många, och de flesta används aldrig i en och samma process.
 */
export function loadNodeFontEngine(fontDir = path.join(process.cwd(), "public", "fonts")) {
  pending ??= Promise.all(
    [...CORE_FONT_FILES, ...FALLBACK_FILES].map(async ({ key, file }) => [key, toArrayBuffer(await readFile(path.join(fontDir, file)))] as [FontFileKey, ArrayBuffer]),
  )
    .then((entries) =>
      createFontEngine(new Map(entries), {
        read(key) {
          const file = fontFileOf(key);
          if (!file) return null;
          try {
            return toArrayBuffer(readFileSync(path.join(fontDir, file)));
          } catch {
            // Filen saknas på disk: raden ritas i grundtypsnittet, hellre än att sidan faller.
            return null;
          }
        },
      }),
    )
    .catch((error: unknown) => {
      pending = null;
      throw error;
    });
  return pending;
}
