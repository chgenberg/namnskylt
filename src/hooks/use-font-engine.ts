"use client";

import { useEffect, useState } from "react";
import { approxFonts, type FontEngine } from "@/engine";
import { loadBrowserFallbackFonts, loadBrowserFontEngine } from "@/lib/fonts/load-browser";

/**
 * Tabellmått vid serverrendering och första klientrendering (samma markup,
 * ingen hydreringsdiff), därefter de riktiga fontfilerna med glyfkonturer.
 * Reservtypsnittet kommer sist, i bakgrunden: en rad som redan ritats utan det
 * ritas då om.
 */
export function useFontEngine(): FontEngine {
  const [fonts, setFonts] = useState<FontEngine>(approxFonts);
  useEffect(() => {
    let active = true;
    loadBrowserFontEngine()
      .then(async (engine) => {
        if (active) setFonts(engine);
        // Ny identitet bara när något faktiskt ska ritas om, så att sidan inte räknar om allt i onödan.
        if ((await loadBrowserFallbackFonts()) && active) setFonts({ ...engine });
      })
      .catch((error: unknown) => console.error("Fontfilerna kunde inte laddas", error));
    return () => {
      active = false;
    };
  }, []);
  return fonts;
}
