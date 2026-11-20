import { FALLBACK_FONT_FILES, FONTS, getFont, type FontFace, type FontId } from "@/engine";

type Weight = "regular" | "bold";
export type FontFileKey = `${FontId | "fallback"}/${Weight}`;

/** Reservtypsnittets fil i samma vikt som raden. */
export function fallbackFileKey(face: Pick<FontFace, "bold">): FontFileKey {
  return `fallback/${face.bold ? "bold" : "regular"}`;
}

/** Filen radens typsnitt ritas med. Ett typsnitt utan fet stil ritar en fet rad i normal stil. */
export function fontFileKey(face: FontFace): FontFileKey {
  return `${face.fontId}/${face.bold && getFont(face.fontId).files.bold !== null ? "bold" : "regular"}`;
}

export interface FontFile {
  key: FontFileKey;
  file: string;
}

/**
 * Verkstadens typsnitt, som de flesta skyltar ritas med: de hämtas innan motorn är klar. Övriga
 * typsnitt hämtas först när en skylt behöver dem (`fontFileOf`), eftersom de är många.
 */
export const CORE_FONT_FILES: readonly FontFile[] = FONTS.filter((font) => font.workshop).flatMap((font) => [
  { key: `${font.id}/regular` as const, file: font.files.regular },
  ...(font.files.bold ? [{ key: `${font.id}/bold` as const, file: font.files.bold }] : []),
]);

/** Typsnittet en rad ritas i medan dess egen fil hämtas. */
export const STAND_IN_FONT: FontId = "arial";

/**
 * Reservtypsnittets filer. De behövs bara för en rad med ett tecken radens
 * typsnitt saknar, så webbläsaren hämtar dem i bakgrunden efter de övriga.
 * Servern läser alla filer direkt.
 */
export const FALLBACK_FILES: readonly FontFile[] = [
  { key: "fallback/regular", file: FALLBACK_FONT_FILES.regular },
  { key: "fallback/bold", file: FALLBACK_FONT_FILES.bold },
];

/** Filens sökväg under `public/fonts`, eller `null` för en nyckel som inte hör till något typsnitt. */
export function fontFileOf(key: FontFileKey): string | null {
  const [id, weight] = key.split("/") as [FontId | "fallback", Weight];
  if (id === "fallback") return FALLBACK_FONT_FILES[weight];
  const font = FONTS.find((candidate) => candidate.id === id);
  if (!font) return null;
  return weight === "bold" ? font.files.bold : font.files.regular;
}
