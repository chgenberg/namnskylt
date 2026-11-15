import { LOGO_ORIGINAL_ID_PATTERN } from "@/engine";
import { LOGO_ORIGINAL_MAX_BYTES, LOGO_ORIGINAL_PATH } from "@/lib/logo-images/original-model";

/** Namnet på en logga som hämtats från kundens hemsida: där finns ingen fil från kunden. */
export const FETCHED_LOGO_NAME = "logga-fran-hemsidan";

/** Filen ur en data-URL i base64, som den som varumärkesläsningen svarar med. `null` för allt annat. */
export function dataUrlFile(dataUrl: string): Blob | null {
  const match = /^data:([a-z0-9.+/-]+);base64,([A-Za-z0-9+/]+={0,2})$/i.exec(dataUrl);
  if (!match?.[1] || !match[2]) return null;
  try {
    const binary = atob(match[2]);
    return new Blob([Uint8Array.from(binary, (char) => char.charCodeAt(0))], { type: match[1] });
  } catch {
    return null;
  }
}

/**
 * Sparar filen loggan lästes från på servern och ger dess id, som läggs på
 * loggan (`originalId`). Verkstaden kan då få originalet utan att kunden
 * laddar upp igen. `null` när filen inte gick att spara: skylten fungerar som
 * förut och kunden får inget felmeddelande.
 */
export async function storeLogoOriginal(file: Blob, name: string): Promise<string | null> {
  if (file.size === 0 || file.size > LOGO_ORIGINAL_MAX_BYTES) return null;
  try {
    const response = await fetch(LOGO_ORIGINAL_PATH, {
      method: "POST",
      headers: { "content-type": "application/octet-stream", "x-file-name": encodeURIComponent(name) },
      body: file,
    });
    const body: unknown = response.ok ? await response.json() : null;
    const id = typeof body === "object" && body !== null && "id" in body ? body.id : null;
    return typeof id === "string" && LOGO_ORIGINAL_ID_PATTERN.test(id) ? id : null;
  } catch {
    return null;
  }
}
