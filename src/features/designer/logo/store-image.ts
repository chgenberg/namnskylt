import type { LogoImage } from "@/engine";

/**
 * Sparar loggans bild på servern och ger adressen dit. Skylten bär då bara
 * adressen: ordern sparar bilden en gång och skylten ryms i en delad länk.
 * Går det inte att spara ligger bilden kvar i skylten, som förut.
 */
export async function storeLogoImage(image: LogoImage): Promise<LogoImage> {
  try {
    const response = await fetch("/api/logo-images", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ src: image.src }),
    });
    const body: unknown = response.ok ? await response.json() : null;
    const src = typeof body === "object" && body !== null && "src" in body ? body.src : null;
    // Märket om att bilden är svartvit följer med den nya adressen.
    return typeof src === "string" ? { ...image, src } : image;
  } catch {
    return image;
  }
}
