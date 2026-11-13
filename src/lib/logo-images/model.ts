import { LOGO_IMAGE_PATTERN, logoImageRefId, type BadgeDocument } from "@/engine";

/**
 * Loggor i färg sparas en gång på servern och pekas ut från skyltarna. Här
 * finns de rena reglerna: läsa en bild ur en data-URL, och byta bildens källa
 * i en hel order utan att röra något annat i skyltarna.
 */

const DATA_URL_PREFIX = "data:image/png;base64,";

/** Bildens bytes ur en data-URL, eller `null` när det inte är en PNG i base64. */
export function pngBytes(dataUrl: string): Buffer | null {
  return LOGO_IMAGE_PATTERN.test(dataUrl) ? Buffer.from(dataUrl.slice(DATA_URL_PREFIX.length), "base64") : null;
}

export function pngDataUrl(bytes: Uint8Array): string {
  return `${DATA_URL_PREFIX}${Buffer.from(bytes).toString("base64")}`;
}

/** Bilderna som ligger i skyltarna som data-URL, var och en en gång. */
export function embeddedLogoImages(badges: readonly BadgeDocument[]): string[] {
  const sources = badges.flatMap((badge) => (badge.logo?.image ? [badge.logo.image.src] : []));
  return [...new Set(sources)].filter((src) => logoImageRefId(src) === null);
}

/** Id för bilderna som skyltarna pekar ut på servern, var och en en gång. */
export function referencedLogoImages(badges: readonly BadgeDocument[]): string[] {
  const ids = badges.flatMap((badge) => {
    const id = badge.logo?.image ? logoImageRefId(badge.logo.image.src) : null;
    return id ? [id] : [];
  });
  return [...new Set(ids)];
}

/**
 * Skyltarna med bildernas källa utbytt. `replace` ger den nya källan, eller
 * `undefined` för att lämna bilden som den är. Skyltar utan bild returneras orörda.
 */
export function replaceLogoImages(badges: readonly BadgeDocument[], replace: (src: string) => string | undefined): BadgeDocument[] {
  return badges.map((badge) => {
    const image = badge.logo?.image;
    const next = image ? replace(image.src) : undefined;
    return badge.logo && next !== undefined && next !== image?.src ? { ...badge, logo: { ...badge.logo, image: { src: next } } } : badge;
  });
}
