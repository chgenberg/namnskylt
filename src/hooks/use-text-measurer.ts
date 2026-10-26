"use client";

import { useEffect, useState } from "react";
import { approxMeasure, createCanvasMeasurer, type TextMeasurer } from "@/engine";

/**
 * Tabellmätning vid serverrendering och första klientrendering (samma markup,
 * ingen hydreringsdiff), därefter canvas med det typsnitt som faktiskt ritas.
 */
export function useTextMeasurer(): TextMeasurer {
  const [measure, setMeasure] = useState<TextMeasurer>(() => approxMeasure);
  useEffect(() => {
    setMeasure(() => createCanvasMeasurer());
  }, []);
  return measure;
}
