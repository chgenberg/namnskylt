import { FONTS, type FontFace, type FontId } from "@/engine";

export type FontFileKey = `${FontId}/${"regular" | "bold"}`;

export function fontFileKey(face: FontFace): FontFileKey {
  return `${face.fontId}/${face.bold ? "bold" : "regular"}`;
}

/** Alla fontfiler motorn behöver, med sökväg under `public/fonts`. */
export const FONT_FILES: readonly { key: FontFileKey; file: string }[] = FONTS.flatMap((font) => [
  { key: `${font.id}/regular` as const, file: font.files.regular },
  { key: `${font.id}/bold` as const, file: font.files.bold },
]);
