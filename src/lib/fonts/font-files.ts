import { FALLBACK_FONT_FILES, FONTS, type FontFace, type FontId } from "@/engine";

type Weight = "regular" | "bold";
export type FontFileKey = `${FontId | "fallback"}/${Weight}`;

/** Reservtypsnittets fil i samma vikt som raden. */
export function fallbackFileKey(face: Pick<FontFace, "bold">): FontFileKey {
  return `fallback/${face.bold ? "bold" : "regular"}`;
}

export function fontFileKey(face: FontFace): FontFileKey {
  return `${face.fontId}/${face.bold ? "bold" : "regular"}`;
}

export interface FontFile {
  key: FontFileKey;
  file: string;
}

/** Fontfilerna skylten ritas med, med sökväg under `public/fonts`. De hämtas innan motorn är klar. */
export const FONT_FILES: readonly FontFile[] = FONTS.flatMap((font) => [
  { key: `${font.id}/regular` as const, file: font.files.regular },
  { key: `${font.id}/bold` as const, file: font.files.bold },
]);

/**
 * Reservtypsnittets filer. De behövs bara för en rad med ett tecken radens
 * typsnitt saknar, så webbläsaren hämtar dem i bakgrunden efter de övriga.
 * Servern läser alla filer direkt.
 */
export const FALLBACK_FILES: readonly FontFile[] = [
  { key: "fallback/regular", file: FALLBACK_FONT_FILES.regular },
  { key: "fallback/bold", file: FALLBACK_FONT_FILES.bold },
];
