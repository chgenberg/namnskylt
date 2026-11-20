import { LOGO_ORIGINAL_ID_PATTERN } from "@/engine";
import { LOGO_ORIGINAL_MAX_BYTES, LOGO_ORIGINAL_PATH } from "@/lib/logo-images/original-model";

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
