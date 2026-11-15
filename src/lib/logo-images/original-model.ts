import { LOGO_ORIGINAL_ID_PATTERN, type BadgeDocument } from "@/engine";

/**
 * Loggans originalfil: filen kunden laddade upp, sparad en gång på servern
 * under sin SHA-256. Skylten bär bara id:t (`BadgeLogo.originalId`). Här finns
 * de rena reglerna: vilka filer som tas emot, vad filen får heta när den
 * laddas ner, och hur hänvisningarna läses ur en order. Inget här kräver Node,
 * så skyltmotorn i webbläsaren kan läsa samma gränser som servern.
 */

/** Största fil som sparas. En logga som är större än så är sällan en logga. */
export const LOGO_ORIGINAL_MAX_BYTES = 10 * 1024 * 1024;

/** Hit laddas filen upp; filen hämtas på samma adress följd av sitt id. */
export const LOGO_ORIGINAL_PATH = "/api/logo-originals";

/** Adressen där en inloggad i panelen laddar ner filen. */
export function logoOriginalHref(id: string): string {
  return `${LOGO_ORIGINAL_PATH}/${id}`;
}

export interface LogoFileType {
  mime: "image/svg+xml" | "image/png" | "image/jpeg" | "image/webp" | "image/gif" | "application/pdf";
  extension: "svg" | "png" | "jpg" | "webp" | "gif" | "pdf";
}

const startsWith = (bytes: Uint8Array, signature: readonly number[], offset = 0) =>
  bytes.length >= offset + signature.length && signature.every((value, i) => bytes[offset + i] === value);

const ascii = (text: string) => [...text].map((char) => char.charCodeAt(0));

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff];
const PDF = ascii("%PDF-");
const RIFF = ascii("RIFF");
const WEBP = ascii("WEBP");
const GIF87 = ascii("GIF87a");
const GIF89 = ascii("GIF89a");

/** Så mycket av filen läses för att känna igen en SVG. */
const SVG_HEAD_BYTES = 4096;
/**
 * En SVG är XML vars första element är `<svg`. Före det får bara stå en
 * XML-deklaration, kommentarer och en DOCTYPE (Illustrator lägger entiteter i den).
 */
const SVG_HEAD = /^\s*(?:<\?xml[\s\S]*?\?>\s*)?(?:<!--[\s\S]*?-->\s*|<!DOCTYPE[^[>]*(?:\[[\s\S]*?\]\s*)?>\s*)*<svg[\s>]/i;

function looksLikeSvg(bytes: Uint8Array): boolean {
  const head = bytes.subarray(0, SVG_HEAD_BYTES);
  // Text har inga nollbytes; en binär fil som råkar börja med `<` är ingen SVG.
  if (head.includes(0)) return false;
  return SVG_HEAD.test(new TextDecoder("utf-8").decode(head).replace(/^\uFEFF/, ""));
}

/**
 * Filtypen läst ur innehållet, aldrig ur det klienten påstår. `null` för allt
 * som inte är en SVG, PNG, JPEG, WebP, GIF eller PDF.
 */
export function detectLogoFileType(bytes: Uint8Array): LogoFileType | null {
  if (startsWith(bytes, PNG)) return { mime: "image/png", extension: "png" };
  if (startsWith(bytes, JPEG)) return { mime: "image/jpeg", extension: "jpg" };
  if (startsWith(bytes, RIFF) && startsWith(bytes, WEBP, 8)) return { mime: "image/webp", extension: "webp" };
  if (startsWith(bytes, GIF87) || startsWith(bytes, GIF89)) return { mime: "image/gif", extension: "gif" };
  if (startsWith(bytes, PDF)) return { mime: "application/pdf", extension: "pdf" };
  if (looksLikeSvg(bytes)) return { mime: "image/svg+xml", extension: "svg" };
  return null;
}

const EXTENSION_OF: Record<string, LogoFileType["extension"]> = {
  "image/svg+xml": "svg",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/pdf": "pdf",
};

const MAX_NAME_CHARS = 120;

/**
 * Filens namn som det får sparas: sista delen av sökvägen, utan styrtecken och
 * tecken som betyder något i en sökväg eller ett huvud. `null` när inget blir kvar.
 */
export function cleanFileName(name: string | null | undefined): string | null {
  const last = (name ?? "").split(/[\\/]/).pop() ?? "";
  const cleaned = last
    // eslint-disable-next-line no-control-regex -- styrtecken ska bort ur filnamnet
    .replace(/[\u0000-\u001f\u007f"<>:|?*;%]/g, "")
    .replace(/\s+/g, " ")
    .replace(/^[.\s]+/, "")
    .trim()
    .slice(0, MAX_NAME_CHARS)
    .trim();
  return cleaned || null;
}

/**
 * Namnet filen laddas ner med: det sparade namnet med ändelsen som hör till
 * filens verkliga typ. En fil som påstods vara `logga.png` men är en SVG heter
 * `logga.svg`. Utan namn heter den efter sitt id.
 */
export function downloadFileName(id: string, name: string | null, mime: string): string {
  const extension = EXTENSION_OF[mime] ?? "bin";
  // Ändelsen bort först: ett namn som bara är en ändelse är inget namn.
  const base = cleanFileName((name ?? "").replace(/\.[A-Za-z0-9]{1,5}$/, ""));
  return `${base ?? `logga-${id.slice(0, 8)}`}.${extension}`;
}

/**
 * `Content-Disposition` som alltid ger en nedladdning. Namnet står två gånger:
 * en gång med bara ASCII för äldre klienter och en gång i UTF-8.
 */
export function attachmentDisposition(fileName: string): string {
  const fallback = fileName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e]/g, "_")
    .replace(/["\\]/g, "_");
  const encoded = encodeURIComponent(fileName).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

/** Id för originalfilerna som skyltarna pekar på, var och en en gång. */
export function referencedLogoOriginals(badges: readonly BadgeDocument[]): string[] {
  const ids = badges.flatMap((badge) => {
    const id = badge.logo?.originalId;
    return id && LOGO_ORIGINAL_ID_PATTERN.test(id) ? [id] : [];
  });
  return [...new Set(ids)];
}

/**
 * Skyltarna utan de hänvisningar som `drop` pekar ut. Inget annat i skylten
 * ändras, och skyltar som inte berörs returneras orörda.
 */
export function withoutLogoOriginals(badges: readonly BadgeDocument[], drop: (id: string) => boolean): BadgeDocument[] {
  return badges.map((badge) => {
    const id = badge.logo?.originalId;
    if (!badge.logo || !id || !drop(id)) return badge;
    const logo = { ...badge.logo };
    delete logo.originalId;
    return { ...badge, logo };
  });
}
