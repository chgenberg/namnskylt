import { readFile } from "node:fs/promises";
import path from "node:path";
import type { FontEngine } from "@/engine";
import { createFontEngine } from "./font-engine";
import { FONT_FILES, type FontFileKey } from "./font-files";

let pending: Promise<FontEngine> | null = null;

/** Läser fontfilerna från `public/fonts` — servern och testerna. */
export function loadNodeFontEngine(fontDir = path.join(process.cwd(), "public", "fonts")) {
  pending ??= Promise.all(
    FONT_FILES.map(async ({ key, file }) => {
      const data = await readFile(path.join(fontDir, file));
      const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
      return [key, buffer as ArrayBuffer] as [FontFileKey, ArrayBuffer];
    }),
  )
    .then((entries) => createFontEngine(new Map(entries)))
    .catch((error: unknown) => {
      pending = null;
      throw error;
    });
  return pending;
}
