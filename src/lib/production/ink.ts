/**
 * Verkstadens filkontrakt (Skylt & Gravyrteknik, `@skylt/production`).
 * Färgerna är heliga: maskinen väljer verktyg efter dem.
 */
export const PRODUCTION_INK = {
  /** Skär längs raka kanter — arkets rutnät och metallens ytterkontur. */
  cut: "#FF0000",
  /** Genomskär: rundade hörn, ovaler och hål. */
  throughCut: "#0000FF",
  engrave: "#000000",
} as const;

/** Hårlinje till maskinen. */
export const HAIRLINE_MM = 0.03;
/** Korrekturet ritas tjockt för att kunna granskas på papper och skärm. */
export const PROOF_STROKE_MM = 0.35;

/**
 * Metallskärningens verktyg är Ø3 mm. Konturen bommas ut med radien så att
 * den skurna skylten får de mått kunden beställde.
 */
export const CUTTER_OFFSET_MM = 1.5;

export const DXF_LAYERS = {
  cut: { name: "CUT", color: 1 },
  engrave: { name: "ENGRAVE", color: 7 },
  drill: { name: "DRILL", color: 5 },
} as const;
