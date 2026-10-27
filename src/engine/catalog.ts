import type {
  BadgeShape,
  FontId,
  FrameStyle,
  LogoPlacement,
  MaterialFinish,
  MaterialId,
  Mm,
  MountingId,
} from "./types";

/**
 * Sortimentet följer det Skylt & Gravyrteknik faktiskt tillverkar. Koderna i
 * `supplierCode` / färg-id:n är leverantörens egna, så en order kan skickas
 * utan översättningstabell på deras sida.
 */

export interface ColorCombo {
  id: string;
  name: string;
  /** Ytskiktet. */
  surface: string;
  /** Kärnan som gravyren friläger — eller lasermärkets ton på metall. */
  engraving: string;
}

export interface BadgeMaterial {
  id: MaterialId;
  name: string;
  description: string;
  finish: MaterialFinish;
  supplierCode: string;
  thicknessMm: Mm;
  basePriceSek: number;
  colors: readonly ColorCombo[];
}

const WHITE = "#FFFFFF";
const BLACK = "#111111";

const PLASTIC_COLORS: readonly ColorCombo[] = [
  { id: "white-black", name: "Vit / Svart", surface: WHITE, engraving: BLACK },
  { id: "black-white", name: "Svart / Vit", surface: BLACK, engraving: WHITE },
  { id: "darkblue-white", name: "Mörkblå / Vit", surface: "#003366", engraving: WHITE },
  { id: "white-blue", name: "Vit / Blå", surface: WHITE, engraving: "#0057B8" },
  { id: "silver-black", name: "Silver / Svart", surface: "#C5CDD4", engraving: BLACK },
  { id: "gold-black", name: "Guld / Svart", surface: "#D4A017", engraving: BLACK },
  { id: "gray-white", name: "Grå / Vit", surface: "#7A828C", engraving: WHITE },
  { id: "darkgreen-white", name: "Mörkgrön / Vit", surface: "#006B2E", engraving: WHITE },
  { id: "brown-white", name: "Brun / Vit", surface: "#8A4020", engraving: WHITE },
  { id: "red-white", name: "Röd / Vit", surface: "#E31C23", engraving: WHITE },
];

export const MATERIALS: readonly BadgeMaterial[] = [
  {
    id: "plastic-2-layer",
    name: "Gravyrplast",
    description: "Tvålagersplast. Gravyren friläger kärnans färg — skarp kontrast, lätt att bära.",
    finish: "plastic",
    supplierCode: "gravyrplast-2-lager-0-8mm",
    thicknessMm: 0.8,
    basePriceSek: 39,
    colors: PLASTIC_COLORS,
  },
  {
    id: "aluminium-anodized",
    name: "Eloxerad aluminium",
    description: "Borstad metall med svartfylld gravyr. Lätt, tålig och diskret exklusiv.",
    finish: "aluminium",
    supplierCode: "aluminum-1mm",
    thicknessMm: 1,
    basePriceSek: 69,
    colors: [
      { id: "alu-natural-black", name: "Natur / Svart", surface: "#C7CBD1", engraving: BLACK },
      { id: "alu-natural-raw", name: "Natur / Rå", surface: "#C7CBD1", engraving: "#5A6168" },
    ],
  },
  {
    id: "stainless",
    name: "Rostfritt stål",
    description: "Syrafast stål med lasermärkning. För kök, vård och industri.",
    finish: "steel",
    supplierCode: "stainless-steel-1mm",
    thicknessMm: 1,
    basePriceSek: 89,
    colors: [{ id: "steel-laser", name: "Stål / Laser", surface: "#D5D9DD", engraving: "#3E464E" }],
  },
];

export interface BadgeFont {
  id: FontId;
  name: string;
  /** Reservtypsnitt för `<text>` innan fontfilerna laddats. */
  css: string;
  /**
   * Fontfiler under `public/fonts`. Liberation Sans är metriskt identisk med
   * Arial (samma avancebredder), så radbrytning och krympning blir desamma
   * som i leverantörens Arial — och filerna får distribueras (OFL).
   */
  files: { regular: string; bold: string };
}

/** Gravyrmaskinerna kör Arial-familjen — fler typsnitt går inte att tillverka. */
export const FONTS: readonly BadgeFont[] = [
  {
    id: "arial",
    name: "Arial",
    css: "Arial, 'Helvetica Neue', Helvetica, sans-serif",
    files: { regular: "LiberationSans-Regular.ttf", bold: "LiberationSans-Bold.ttf" },
  },
  {
    id: "arial-narrow",
    name: "Arial Narrow",
    css: "'Arial Narrow', 'Helvetica Neue Condensed', 'Roboto Condensed', Arial, sans-serif",
    files: { regular: "LiberationSansNarrow-Regular.ttf", bold: "LiberationSansNarrow-Bold.ttf" },
  },
];

export interface SizePreset {
  id: string;
  widthMm: Mm;
  heightMm: Mm;
  label: string;
}

export const SIZE_PRESETS: readonly SizePreset[] = [
  { id: "60x20", widthMm: 60, heightMm: 20, label: "Kompakt" },
  { id: "70x25", widthMm: 70, heightMm: 25, label: "Standard" },
  { id: "76x32", widthMm: 76, heightMm: 32, label: "Klassisk" },
  { id: "90x30", widthMm: 90, heightMm: 30, label: "Bred" },
  { id: "90x40", widthMm: 90, heightMm: 40, label: "Stor" },
];

export const SIZE_LIMITS = {
  minWidthMm: 40,
  maxWidthMm: 120,
  minHeightMm: 15,
  maxHeightMm: 60,
} as const;

export const TEXT_LIMITS = {
  maxRows: 3,
  maxChars: 40,
  minCapHeightMm: 1.8,
  maxCapHeightMm: 14,
} as const;

export const LOGO_LIMITS = {
  minHeightMm: 4,
  maxHeightMm: 40,
  defaultHeightMm: 14,
  /** Större banor än så blir tunga i 3D och i ordern — vektoriseraren förenklar under taket. */
  maxPathChars: 80_000,
  maxViewSize: 4096,
} as const;

export const LOGO_PLACEMENTS: readonly { id: LogoPlacement; name: string }[] = [
  { id: "left", name: "Vänster" },
  { id: "top", name: "Ovanför" },
  { id: "right", name: "Höger" },
];

export const SHAPES: readonly { id: BadgeShape; name: string }[] = [
  { id: "rectangle", name: "Rak" },
  { id: "rounded", name: "Rundad" },
  { id: "oval", name: "Oval" },
];

export const FRAME_STYLES: readonly { id: FrameStyle; name: string }[] = [
  { id: "none", name: "Ingen" },
  { id: "solid", name: "Linje" },
  { id: "double", name: "Dubbel" },
];

export interface Mounting {
  id: MountingId;
  name: string;
  description: string;
  priceSek: number;
}

export const MOUNTINGS: readonly Mounting[] = [
  { id: "pin", name: "Nål", description: "Klassisk nål med lås. Säker på kavaj och skjorta.", priceSek: 0 },
  { id: "magnet", name: "Magnet", description: "Inga hål i plagget. Stark neodymmagnet.", priceSek: 19 },
  { id: "clip", name: "Klämma", description: "Fäst på ficka, bälte eller band.", priceSek: 8 },
  { id: "safety-pin", name: "Säkerhetsnål", description: "Enkel och billig — för event och mässor.", priceSek: 4 },
];

export function getMaterial(id: MaterialId): BadgeMaterial {
  const material = MATERIALS.find((m) => m.id === id);
  if (!material) throw new Error(`Okänt material: ${id}`);
  return material;
}

export function getColor(materialId: MaterialId, colorId: string): ColorCombo {
  const { colors } = getMaterial(materialId);
  return colors.find((c) => c.id === colorId) ?? colors[0]!;
}

export function getFont(id: FontId): BadgeFont {
  return FONTS.find((f) => f.id === id) ?? FONTS[0]!;
}

export function getMounting(id: MountingId): Mounting {
  return MOUNTINGS.find((m) => m.id === id) ?? MOUNTINGS[0]!;
}
