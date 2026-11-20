"use client";

import { useEffect, useState } from "react";
import { approxFonts, type FontEngine } from "@/engine";
import { loadBrowserFallbackFonts, loadBrowserFontEngine, onBrowserFontsChanged } from "@/lib/fonts/load-browser";

/**
 * Tabellmått vid serverrendering och första klientrendering (samma markup,
 * ingen hydreringsdiff), därefter de riktiga fontfilerna med glyfkonturer.
 * Reservtypsnittet kommer sist, i bakgrunden: en rad som redan ritats utan det
 * ritas då om. Samma sak gäller ett typsnitt utöver verkstadens egna: det hämtas
 * först när en rad ritas i det, och raden ritas om när filen har kommit.
 */
export function useFontEngine(): FontEngine {
  const [fonts, setFonts] = useState<FontEngine>(approxFonts);
  useEffect(() => {
    let active = true;
    let stop = () => {};
    loadBrowserFontEngine()
      .then(async (engine) => {
        if (!active) return;
        setFonts(engine);
        stop = onBrowserFontsChanged(() => setFonts({ ...engine }));
        // Ny identitet bara när något faktiskt ska ritas om, så att sidan inte räknar om allt i onödan.
        if ((await loadBrowserFallbackFonts()) && active) setFonts({ ...engine });
      })
      .catch((error: unknown) => console.error("Fontfilerna kunde inte laddas", error));
    return () => {
      active = false;
      stop();
    };
  }, []);
  return fonts;
}
