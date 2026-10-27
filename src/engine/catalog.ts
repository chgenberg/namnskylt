import type {
  BadgeShape,
  FontId,
  FrameStyle,
  LogoPlacement,
  MaterialFinish,
  MaterialId,
  Mm,
  MountingId,
  Producer,
} from "./types";

/**
 * Sortimentet följer det tillverkarna faktiskt gör. Skylt & Gravyrteknik:
 * koderna i `supplierCode` och färg-id:n är deras egna, så ordern går rakt in
 * i deras API. Quickbutton (QB-katalogen 2023): `supplierCode` är artikelseriens
 * prefix — hela artikelnumret sätts när förfrågan bekräftas.
 */

export interface ColorCombo {
  id: string;
  name: string;
  /** Ytskiktet. */
  surface: string;
  /** Kärnan som gravyren friläger, lasermärkets ton på metall — eller tryckfärgen. */
  engraving: string;
  /** Metallicpigment i ytan (Epoxyline Metallic). */
  metallic?: boolean;
}

export interface BadgeMaterial {
  id: MaterialId;
  name: string;
  /** Kort säljrad till väljarna. */
  tagline: string;
  description: string;
  finish: MaterialFinish;
  producer: Producer;
  /** Exklusiva material visas först och får egen etikett. */
  exclusive: boolean;
  supplierCode: string;
  thicknessMm: Mm;
  basePriceSek: number;
  colors: readonly ColorCombo[];
}

const WHITE = "#FFFFFF";
const BLACK = "#111111";
const GOLD = "#CDA853";
const SILVER = "#C9CED4";

/** Skylt & Gravyrs tvålagersplast — samma färger och hex som deras skyltmotor. */
const PLASTIC_COLORS: readonly ColorCombo[] = [
  { id: "white-black", name: "Vit / Svart", surface: WHITE, engraving: BLACK },
  { id: "black-white", name: "Svart / Vit", surface: BLACK, engraving: WHITE },
  { id: "yellow-black", name: "Gul / Svart", surface: "#FFD200", engraving: BLACK },
  { id: "gold-black", name: "Guld / Svart", surface: "#D4A017", engraving: BLACK },
  { id: "silver-black", name: "Silver / Svart", surface: "#C5CDD4", engraving: BLACK },
  { id: "red-white", name: "Röd / Vit", surface: "#E31C23", engraving: WHITE },
  { id: "blue-white", name: "Blå / Vit", surface: "#0057B8", engraving: WHITE },
  { id: "darkblue-white", name: "Mörkblå / Vit", surface: "#003366", engraving: WHITE },
  { id: "green-white", name: "Grön / Vit", surface: "#00A33A", engraving: WHITE },
  { id: "darkgreen-white", name: "Mörkgrön / Vit", surface: "#006B2E", engraving: WHITE },
  { id: "orange-white", name: "Orange / Vit", surface: "#FF6A00", engraving: WHITE },
  { id: "white-blue", name: "Vit / Blå", surface: WHITE, engraving: "#0057B8" },
  { id: "white-red", name: "Vit / Röd", surface: WHITE, engraving: "#E31C23" },
  { id: "yellow-red", name: "Gul / Röd", surface: "#FFD200", engraving: "#E31C23" },
  { id: "gray-white", name: "Grå / Vit", surface: "#7A828C", engraving: WHITE },
  { id: "brown-white", name: "Brun / Vit", surface: "#8A4020", engraving: WHITE },
  { id: "darkbrown-white", name: "Mörkbrun / Vit", surface: "#4A2412", engraving: WHITE },
];

export const MATERIALS: readonly BadgeMaterial[] = [
  {
    id: "brass",
    name: "Mässing",
    tagline: "Klassisk och elegant",
    description: "Massiv mässing i guld- eller silverfinish med svartfylld gravyr. Den klassiska exklusiva namnskylten. Skyddsfodral ingår.",
    finish: "brass",
    producer: "quickbutton",
    exclusive: true,
    supplierCode: "QB-31-60",
    thicknessMm: 1,
    basePriceSek: 149,
    colors: [
      { id: "brass-gold", name: "Guld / Svart", surface: GOLD, engraving: BLACK },
      { id: "brass-silver", name: "Silver / Svart", surface: SILVER, engraving: BLACK },
    ],
  },
  {
    id: "acrylic",
    name: "Akryl",
    tagline: "Djup och skuggspel",
    description: "Matt, transparent akryl över en färgad botten. Djupet ger ett skuggspel som lyfter intrycket. Skyddsfodral ingår.",
    finish: "acrylic",
    producer: "quickbutton",
    exclusive: true,
    supplierCode: "QB-31-30",
    thicknessMm: 3,
    basePriceSek: 159,
    colors: [
      { id: "acrylic-white", name: "Vit botten / Svart", surface: "#F4F5F4", engraving: BLACK },
      { id: "acrylic-silver", name: "Silver botten / Svart", surface: SILVER, engraving: BLACK },
      { id: "acrylic-grey", name: "Grå botten / Vit", surface: "#8D939A", engraving: WHITE },
      { id: "acrylic-black-matt", name: "Matt svart / Vit", surface: "#1C1D1F", engraving: WHITE },
      { id: "acrylic-black-gloss", name: "Blank svart / Silver", surface: "#0B0B0C", engraving: SILVER },
    ],
  },
  {
    id: "aluminium-solid",
    name: "Massiv aluminium",
    tagline: "Lätt och snygg metall",
    description: "Massiv aluminium i guld- eller silverfinish. Mycket lätt att bära, med svartfylld gravyr. Skyddsfodral ingår.",
    finish: "aluminium",
    producer: "quickbutton",
    exclusive: true,
    supplierCode: "QB-31-63",
    thicknessMm: 1.5,
    basePriceSek: 129,
    colors: [
      { id: "space-silver", name: "Silver / Svart", surface: "#D3D7DC", engraving: BLACK },
      { id: "space-gold", name: "Guld / Svart", surface: "#D6B567", engraving: BLACK },
    ],
  },
  {
    id: "aluminium-anodized",
    name: "Borstad aluminium",
    tagline: "Diskret exklusiv",
    description: "Eloxerad, borstad aluminium med svartfylld eller rå gravyr. Lätt och tålig.",
    finish: "aluminium",
    producer: "skylt-gravyr",
    exclusive: true,
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
    tagline: "För kök, vård och industri",
    description: "Syrafast stål med lasermärkning. Tål disk, sprit och hårt slitage.",
    finish: "steel",
    producer: "skylt-gravyr",
    exclusive: true,
    supplierCode: "stainless-steel-1mm",
    thicknessMm: 1,
    basePriceSek: 89,
    colors: [{ id: "steel-laser", name: "Stål / Laser", surface: "#D5D9DD", engraving: "#3E464E" }],
  },
  {
    id: "epoxy",
    name: "Epoxy",
    tagline: "Färgstark och reptålig",
    description: "Tryckt skylt under en blank kupol av epoxyemalj — extra tålig mot repor. Solida färger eller metallic. Skyddsfodral ingår.",
    finish: "epoxy",
    producer: "quickbutton",
    exclusive: false,
    supplierCode: "QB-31-80",
    thicknessMm: 1.6,
    basePriceSek: 89,
    colors: [
      { id: "epoxy-white", name: "Vit / Svart", surface: WHITE, engraving: BLACK },
      { id: "epoxy-black", name: "Svart / Vit", surface: BLACK, engraving: WHITE },
      { id: "epoxy-black-silver", name: "Svart / Silverfolie", surface: BLACK, engraving: SILVER },
      { id: "epoxy-black-gold", name: "Svart / Guldfolie", surface: BLACK, engraving: GOLD },
      { id: "epoxy-gold", name: "Guld / Svart", surface: GOLD, engraving: BLACK },
      { id: "epoxy-silver", name: "Silver / Svart", surface: SILVER, engraving: BLACK },
      { id: "epoxy-blue-metallic", name: "Blå metallic / Vit", surface: "#1F4FB8", engraving: WHITE, metallic: true },
      { id: "epoxy-yellow-metallic", name: "Gul metallic / Svart", surface: "#E8C21C", engraving: BLACK, metallic: true },
      { id: "epoxy-pink-metallic", name: "Rosa metallic / Vit", surface: "#D9488B", engraving: WHITE, metallic: true },
      { id: "epoxy-red-metallic", name: "Röd metallic / Vit", surface: "#C3202B", engraving: WHITE, metallic: true },
      { id: "epoxy-purple-metallic", name: "Lila metallic / Vit", surface: "#6B3FA8", engraving: WHITE, metallic: true },
    ],
  },
  {
    id: "plastic-2-layer",
    name: "Gravyrplast",
    tagline: "Prisvärd, 17 färger",
    description: "Tvålagersplast. Gravyren friläger kärnans färg — skarp kontrast, lätt att bära.",
    finish: "plastic",
    producer: "skylt-gravyr",
    exclusive: false,
    supplierCode: "gravyrplast-2-lager-0-8mm",
    thicknessMm: 0.8,
    basePriceSek: 39,
    colors: PLASTIC_COLORS,
  },
];

export const MATERIAL_IDS = MATERIALS.map((m) => m.id) as [MaterialId, ...MaterialId[]];

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

/** Storlekarna i QB-katalogens modeller plus Skylt & Gravyrs vanligaste. */
export const SIZE_PRESETS: readonly SizePreset[] = [
  { id: "60x20", widthMm: 60, heightMm: 20, label: "Kompakt" },
  { id: "68x25", widthMm: 68, heightMm: 25, label: "Smal" },
  { id: "70x25", widthMm: 70, heightMm: 25, label: "Standard" },
  { id: "59x34", widthMm: 59, heightMm: 34, label: "Klassisk" },
  { id: "62x32", widthMm: 62, heightMm: 32, label: "Mellan" },
  { id: "74x36", widthMm: 74, heightMm: 36, label: "Stor" },
  { id: "85x30", widthMm: 85, heightMm: 30, label: "Bred" },
];

/** Rund skylt: alltid lika bred som hög. */
export const ROUND_SIZE_PRESETS: readonly SizePreset[] = [
  { id: "40x40", widthMm: 40, heightMm: 40, label: "Liten" },
  { id: "45x45", widthMm: 45, heightMm: 45, label: "Mellan" },
  { id: "55x55", widthMm: 55, heightMm: 55, label: "Stor" },
];

export const DEFAULT_ROUND_SIZE_MM = 55;

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
  { id: "stadium", name: "Kapsel" },
  { id: "oval", name: "Oval" },
  { id: "round", name: "Rund" },
  { id: "hexagon", name: "Sexkant" },
  { id: "octagon", name: "Åttkant" },
];

export const SHAPE_IDS = SHAPES.map((s) => s.id) as [BadgeShape, ...BadgeShape[]];

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

export function isPartnerMade(id: MaterialId): boolean {
  return getMaterial(id).producer === "quickbutton";
}

export function getFont(id: FontId): BadgeFont {
  return FONTS.find((f) => f.id === id) ?? FONTS[0]!;
}

export function getMounting(id: MountingId): Mounting {
  return MOUNTINGS.find((m) => m.id === id) ?? MOUNTINGS[0]!;
}
