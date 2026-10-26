import { useEffect, useMemo, useState } from "react";
import {
  engravingPaths,
  getMaterial,
  layoutBadge,
  type BadgeDocument,
  type FontEngine,
} from "@/engine";
import { buildBadgeGeometry, type BadgeGeometry } from "./geometry";

/** Väntetid innan CSG körs, så att en dragen slider inte bygger om varje bildruta. */
const REBUILD_DELAY_MS = 90;

/**
 * Den graverade skylten. Ombyggnaden är dyr (CSG), så den debouncas och
 * körs bara när något som påverkar geometrin ändrats — färgbyten rör den
 * inte. Föregående geometri visas tills den nya är klar.
 */
export function useBadgeGeometry(doc: BadgeDocument, fonts: FontEngine): BadgeGeometry | null {
  const thicknessMm = getMaterial(doc.materialId).thicknessMm;
  const finish = getMaterial(doc.materialId).finish;

  const input = useMemo(() => {
    const engraving = engravingPaths(layoutBadge(doc, fonts), fonts);
    return {
      doc,
      engraving,
      key: JSON.stringify([
        doc.shape,
        doc.size,
        doc.cornerRadiusMm,
        thicknessMm,
        finish,
        engraving?.map((p) => p.d),
      ]),
    };
  }, [doc, fonts, thicknessMm, finish]);

  const [geometry, setGeometry] = useState<BadgeGeometry | null>(null);
  const { key } = input;

  useEffect(() => {
    const timer = window.setTimeout(
      () => setGeometry(buildBadgeGeometry(input.doc, input.engraving)),
      REBUILD_DELAY_MS,
    );
    return () => window.clearTimeout(timer);
    // Bygg om när nyckeln ändras, inte vid varje nytt dokumentobjekt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => () => geometry?.forEach((part) => part.dispose()), [geometry]);
  return geometry;
}
