import { preload } from "react-dom";
import { FONT_FILES } from "@/lib/fonts/font-files";

/** Poly Haven, CC0. Studio med mjuka softboxar — ger reflexerna i kant och gravyr. */
export const STUDIO_HDRI = "/hdri/studio_small_08.hdr";

/**
 * Startar hämtningen av ljusmiljön och fontfilerna redan i HTML:en, i stället
 * för när 3D-koden laddats och körts. Båda hämtas med `fetch`, därav `as: "fetch"`.
 */
export function preloadDesignerAssets() {
  const options = { as: "fetch", crossOrigin: "anonymous" } as const;
  preload(STUDIO_HDRI, options);
  for (const { file } of FONT_FILES) preload(`/fonts/${file}`, options);
}
