import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";

let cached: Promise<string | null> | null = null;

/**
 * Sajtens logga som data-URL, för dokument som ritas utan att nå sajten
 * (offertens PDF). `null` om filen inte går att läsa: då står namnet i stället.
 */
export function siteLogoDataUrl(): Promise<string | null> {
  cached ??= readFile(path.join(process.cwd(), "public", "logo-namnskylt.svg"))
    .then((file) => `data:image/svg+xml;base64,${file.toString("base64")}`)
    .catch(() => null);
  return cached;
}
