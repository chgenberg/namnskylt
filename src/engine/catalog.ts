import type {
  BadgeShape,
  BlankId,
  FontId,
  FrameStyle,
  LogoPlacement,
  MaterialFinish,
  MaterialId,
  Mm,
  MountingId,
  Producer,
  SignClass,
} from "./types";

/**
 * Sortimentet följer det tillverkarna faktiskt gör. Skylt & Gravyrteknik:
 * koderna i `supplierCode` och färg-id:n är deras egna, så ordern går rakt in
 * i deras API. Quickbutton (QB-katalogen 2023): `supplierCode` är artikelseriens
 * prefix — hela artikelnumret sätts när förfrågan bekräftas.
 *
 * Bara material med `offered` säljs på sajten. De övriga ligger kvar så att
 * sparade ordrar, offerter, butiker och utskickets bilder går att rita.
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
  /** Lackad yta på metall: slät och matt, utan borstning och metallglans. */
  lacquered?: boolean;
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
  /** Säljs på sajten i dag. */
  offered: boolean;
  /** Levereras som färdigskurna ämnen: verkstaden graverar bara, inget skärs. */
  precut?: boolean;
  /** Skärs ur ark och kan därför få en egen form. */
  customShape?: boolean;
  supplierCode: string;
  thicknessMm: Mm;
  /** Raden i prismodellen som materialet prissätts efter. */
  priceClass: SignClass;
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
    // Preliminärt tills verkstaden bekräftat: artikelkod, tjocklek och gravyrens färg.
    id: "metal",
    name: "Metall",
    tagline: "Stilren, i tre ytor",
    description: "Tunn metallskylt med graverad text, i vitt, borstat guld eller borstat silver.",
    finish: "aluminium",
    producer: "skylt-gravyr",
    exclusive: false,
    offered: true,
    precut: true,
    supplierCode: "namnskylt-metall",
    thicknessMm: 0.5,
    priceClass: "premium",
    colors: [
      { id: "metal-white", name: "Vit", surface: "#F7F7F5", engraving: BLACK, lacquered: true },
      { id: "metal-gold", name: "Borstat guld", surface: "#C8A440", engraving: BLACK },
      { id: "metal-silver", name: "Borstat silver", surface: "#B4B6B8", engraving: BLACK },
    ],
  },
  {
    // Tvålagers gravyrplast i verkstadens 1,5 mm. Färg-id:na är deras egna.
    id: "plastic",
    name: "Plast",
    tagline: "Prisvärd, i egen form",
    description: "Tvålagers gravyrplast. Gravyren friläger kärnans färg, och skylten kan skäras i en egen form.",
    finish: "plastic",
    producer: "skylt-gravyr",
    exclusive: false,
    offered: true,
    customShape: true,
    supplierCode: "plastic-1.5mm",
    thicknessMm: 1.5,
    priceClass: "standard",
    colors: [
      { id: "white-black", name: "Vit / Svart", surface: WHITE, engraving: BLACK },
      { id: "black-white", name: "Svart / Vit", surface: BLACK, engraving: WHITE },
      { id: "gold-black", name: "Guld / Svart", surface: "#D4A017", engraving: BLACK },
      { id: "silver-black", name: "Silver / Svart", surface: "#C5CDD4", engraving: BLACK },
    ],
  },
  {
    id: "brass",
    name: "Mässing",
    tagline: "Klassisk och elegant",
    description: "Massiv mässing i guld- eller silverfinish med svartfylld gravyr. Den klassiska exklusiva namnskylten. Skyddsfodral ingår.",
    finish: "brass",
    producer: "quickbutton",
    exclusive: true,
    offered: false,
    supplierCode: "QB-31-60",
    thicknessMm: 1,
    priceClass: "premium",
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
    offered: false,
    supplierCode: "QB-31-30",
    thicknessMm: 3,
    priceClass: "standard",
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
    offered: false,
    supplierCode: "QB-31-63",
    thicknessMm: 1.5,
    priceClass: "premium",
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
    offered: false,
    supplierCode: "aluminum-1mm",
    thicknessMm: 1,
    priceClass: "premium",
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
    offered: false,
    supplierCode: "stainless-steel-1mm",
    thicknessMm: 1,
    priceClass: "premium",
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
    offered: false,
    supplierCode: "QB-31-80",
    thicknessMm: 1.6,
    priceClass: "standard",
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
    offered: false,
    supplierCode: "gravyrplast-2-lager-0-8mm",
    thicknessMm: 0.8,
    priceClass: "standard",
    colors: PLASTIC_COLORS,
  },
];

export const MATERIAL_IDS = MATERIALS.map((m) => m.id) as [MaterialId, ...MaterialId[]];

export const OFFERED_MATERIALS: readonly BadgeMaterial[] = MATERIALS.filter((m) => m.offered);

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

export interface BadgeBlank {
  id: BlankId;
  name: string;
  shape: BadgeShape;
  widthMm: Mm;
  heightMm: Mm;
  /** Gäller bara `shape === "rounded"`. */
  cornerRadiusMm: Mm;
}

/**
 * Ämnena som säljs. Måtten är uppskattade från foton och preliminära tills
 * verkstaden lämnat de riktiga — ändra dem här, ingen annanstans.
 */
export const BLANKS: readonly BadgeBlank[] = [
  { id: "rectangle", name: "Rektangel", shape: "rounded", widthMm: 75, heightMm: 25, cornerRadiusMm: 3 },
  { id: "oval", name: "Oval", shape: "oval", widthMm: 70, heightMm: 40, cornerRadiusMm: 0 },
  { id: "rectangle-large", name: "Stor rektangel", shape: "rounded", widthMm: 75, heightMm: 45, cornerRadiusMm: 4 },
  { id: "cushion", name: "Kudde", shape: "cushion", widthMm: 75, heightMm: 35, cornerRadiusMm: 0 },
];

export const SIZE_LIMITS = {
  minWidthMm: 40,
  maxWidthMm: 120,
  minHeightMm: 15,
  maxHeightMm: 60,
} as const;

/** Egen form: måttet kunden får rita inom, och vad en skärmaskin klarar. */
export const CUSTOM_SHAPE_LIMITS = {
  minSideMm: 25,
  maxSideMm: 120,
  minPoints: 3,
  maxPoints: 64,
  minEdgeMm: 2,
  minAreaMm2: 300,
  maxCornerRadiusMm: 20,
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
  /**
   * Längsta data-URL för en logga i färg, ungefär 150 kB bild. Bilden följer med varje
   * skylt i ordern, så designern krymper den under taket.
   */
  maxImageChars: 200_000,
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
  { id: "cushion", name: "Kudde" },
  { id: "custom", name: "Egen form" },
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
  /** Säljs på sajten i dag. Priset står i prismodellen. */
  offered: boolean;
  /** Fästet finns bara på material med de här ytorna. Utelämnat = alla material. */
  finishes?: readonly MaterialFinish[];
  /** Raden under fästet i väljaren, när det inte finns på alla skyltar. */
  note?: string;
}

export const MOUNTINGS: readonly Mounting[] = [
  { id: "pin", name: "Nål", description: "Klassisk nål med lås. Säker på kavaj och skjorta.", offered: true },
  { id: "magnet", name: "Magnet", description: "Inga hål i plagget. Stark neodymmagnet.", offered: true },
  // Klämman finns bara på plastskyltar (besked via ägaren 2026-11-16). Måttet står i raden; inga ämnen har ändrats för det.
  {
    id: "clip",
    name: "Klämma",
    description: "Fäst på ficka, bälte eller band.",
    offered: true,
    finishes: ["plastic"],
    note: "Endast för plastskyltar 80 × 25 mm",
  },
  // Säljs inte längre; finns kvar så att äldre ordrar går att rita.
  { id: "safety-pin", name: "Säkerhetsnål", description: "Enkel och billig — för event och mässor.", offered: false },
];

export const OFFERED_MOUNTINGS: readonly Mounting[] = MOUNTINGS.filter((m) => m.offered);

export function getMaterial(id: MaterialId): BadgeMaterial {
  const material = MATERIALS.find((m) => m.id === id);
  if (!material) throw new Error(`Okänt material: ${id}`);
  return material;
}

export function getBlank(id: BlankId): BadgeBlank {
  return BLANKS.find((b) => b.id === id) ?? BLANKS[0]!;
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

/** Sant när fästet går att få på materialet. De flesta fästen finns på alla; klämman bara på plast. */
export function mountingFits(mountingId: MountingId, materialId: MaterialId): boolean {
  const { finishes } = getMounting(mountingId);
  return !finishes || finishes.includes(getMaterial(materialId).finish);
}
