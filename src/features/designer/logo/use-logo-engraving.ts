"use client";

import { useEffect, useRef, type Dispatch } from "react";
import { logoMarking, type BadgeDocument } from "@/engine";
import type { DesignerAction } from "../state";
import { engravingFromImage } from "./trace-image";

/**
 * En logga i färg som graveras men saknar gravyrform får den räknad i
 * bakgrunden ur sin bild. Det gäller skyltar som sparades innan gravyrformen
 * fanns: en återhämtad varukorg, en delad länk eller en äldre order som
 * öppnas igen. En ny logga får gravyrformen direkt när den läggs in.
 *
 * Varje logga provas en gång. Går bilden inte att läsa, eller är siluetten
 * redan gravyrformen, ritas loggan som förut.
 */
export function useLogoEngraving(doc: BadgeDocument, dispatch: Dispatch<DesignerAction>): void {
  const tried = useRef(new Set<string>());
  const logo = doc.logo;
  // En svartvit logga har alltid sin gravyrform: den räknas aldrig om med reglerna för färg.
  const src = logo?.image && !logo.image.mono && !logo.engraveD && logoMarking(doc) === "engrave" ? logo.image.src : null;
  const d = logo?.d ?? "";
  const viewWidth = logo?.viewWidth ?? 0;
  const viewHeight = logo?.viewHeight ?? 0;

  useEffect(() => {
    if (!src || tried.current.has(d)) return;
    tried.current.add(d);
    void engravingFromImage(src, viewWidth, viewHeight)
      .then((engraveD) => {
        // Reducern släpper bara igenom svaret om samma logga ligger kvar på skylten.
        if (engraveD) dispatch({ type: "logo/engraving", d, engraveD });
      })
      .catch(() => {});
  }, [src, d, viewWidth, viewHeight, dispatch]);
}
