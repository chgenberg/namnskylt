import { useEffect, useMemo, useState } from "react";
import {
  engravingPaths,
  getMaterial,
  layoutBadge,
  type BadgeDocument,
  type FontEngine,
} from "@/engine";
import { buildPreviewGeometry, type BadgeGeometry } from "./geometry";
import { fromArrays, type BadgeArrays } from "./geometry-arrays";
import { buildExactGeometry } from "./geometry-worker";

/** Så många frästa varianter sparas — att byta tillbaka form eller typsnitt går direkt. */
const EXACT_CACHE_SIZE = 12;
const exactCache = new Map<string, BadgeArrays>();

function cached(key: string): BadgeArrays | undefined {
  const arrays = exactCache.get(key);
  if (arrays) {
    exactCache.delete(key);
    exactCache.set(key, arrays);
  }
  return arrays;
}

function remember(key: string, arrays: BadgeArrays) {
  exactCache.delete(key);
  exactCache.set(key, arrays);
  const oldest = exactCache.keys().next();
  if (exactCache.size > EXACT_CACHE_SIZE && !oldest.done) exactCache.delete(oldest.value);
}

/**
 * Den graverade skylten. Fräsningen (CSG) är dyr och körs i en worker; under
 * tiden visas en snabb förhandsversion där gravyren ligger som ett tunt skikt
 * på ytan. Bara det som påverkar geometrin bygger om — färgbyten rör den inte.
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
        doc.frame,
        engraving?.map((p) => p.d),
      ]),
    };
  }, [doc, fonts, thicknessMm, finish]);

  const [geometry, setGeometry] = useState<BadgeGeometry | null>(null);
  const { key } = input;

  useEffect(() => {
    const ready = cached(key);
    if (ready) {
      setGeometry(fromArrays(ready));
      return;
    }
    setGeometry(buildPreviewGeometry(input.doc, input.engraving));

    let active = true;
    buildExactGeometry(input.doc, input.engraving).then(
      (arrays) => {
        if (!arrays) return;
        remember(key, arrays);
        if (active) setGeometry(fromArrays(arrays));
      },
      (error: unknown) => console.error("Gravyren kunde inte fräsas", error),
    );
    return () => {
      active = false;
    };
    // Bygg om när nyckeln ändras, inte vid varje nytt dokumentobjekt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => () => geometry?.forEach((part) => part.dispose()), [geometry]);
  return geometry;
}
