"use client";

import { useEffect, useState } from "react";
import { approxFonts, type FontEngine } from "@/engine";
import { loadBrowserFontEngine } from "@/lib/fonts/load-browser";

/**
 * Tabellmått vid serverrendering och första klientrendering (samma markup,
 * ingen hydreringsdiff), därefter de riktiga fontfilerna med glyfkonturer.
 */
export function useFontEngine(): FontEngine {
  const [fonts, setFonts] = useState<FontEngine>(approxFonts);
  useEffect(() => {
    let active = true;
    loadBrowserFontEngine()
      .then((engine) => active && setFonts(engine))
      .catch((error: unknown) => console.error("Fontfilerna kunde inte laddas", error));
    return () => {
      active = false;
    };
  }, []);
  return fonts;
}
