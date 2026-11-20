import { createBadgeDocument, withBlank } from "./document";
import type { BadgeDocument } from "./types";

/**
 * Skyltar till testerna. En ny skylt börjar på metall, som bara går att printa på
 * (beslut av ägaren 2026-11-18). Testerna för gravyren behöver därför en skylt som graveras.
 */

/**
 * En skylt utan vald märkningsmetod, som skyltar sparades innan valet fanns: namnet graveras.
 * Har den nya skyltens mått och material, så att tester som mäter i ritningen står kvar.
 */
export function engravedBadge(texts: readonly string[] = []): BadgeDocument {
  const doc = { ...createBadgeDocument(texts) };
  delete doc.marking;
  return doc;
}

/** En plastskylt på plastens rektangel, utan vald metod. På plast finns alla fyra märkningsmetoderna. */
export function plasticBadge(texts: readonly string[] = [], colorId = "white-black"): BadgeDocument {
  return withBlank({ ...engravedBadge(texts), materialId: "plastic", colorId }, "rectangle");
}

/**
 * Fraktregeln med en gräns i varuvärde, som den var 2026-11-14 till 2026-11-20: varubrev upp till
 * 500 kr, annars paket. Testerna för regelns gräns använder den. Sedan 2026-11-20 är varubrevet
 * standard för varje order i kalkylen, och paketet ett val.
 */
export const TIERED_SHIPPING = { letterSek: 75, parcelSek: 159, letterMaxSek: 500 };
