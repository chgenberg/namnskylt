/**
 * Panelens sektioner i den ordning de står (besked från Mats på verkstaden via ägaren 2026-11-20:
 * skylten byggs, så material och form sätter förutsättningarna innan text, logga och fäste).
 * Listan ger sektionernas nummer i rubrikerna och genvägarna på telefon. Ordningen de ritas i
 * står i `designer.tsx` och ska vara densamma.
 */
const PANEL_ORDER = [
  { id: "material", label: "Material" },
  { id: "format", label: "Form" },
  { id: "text", label: "Text" },
  // Metoden väljs före loggan (besked via ägaren 2026-11-16): den avgör hur loggan sedan märks.
  { id: "marking", label: "Metod" },
  { id: "logo", label: "Logga" },
  { id: "mounting", label: "Fäste" },
  { id: "batch", label: "Fler namn" },
] as const;

export type PanelSectionId = (typeof PANEL_ORDER)[number]["id"];

/** Sektionerna med sitt nummer, från 1, och genvägens korta namn. */
export const PANEL_SECTIONS = PANEL_ORDER.map((section, index) => ({ ...section, step: index + 1 }));

/** Numret sektionen bär i sin rubrik (`PanelSection`). */
export function panelStep(id: PanelSectionId): number {
  return PANEL_ORDER.findIndex((section) => section.id === id) + 1;
}
