import { EXTRA_FONTS } from "./font-list";
import type {
  BadgeShape,
  BlankId,
  ClipOrientation,
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
  /**
   * Metallglans i ytan: Epoxyline Metallic, och gravyrplastens guld och silver, som har en
   * borstad metallfilm överst. Ritas som borstad metall, inte som en platt färg.
   */
  metallic?: boolean;
  /** Lackad yta på metall: slät och matt, utan borstning och metallglans. */
  lacquered?: boolean;
  /**
   * Kombinationen säljs inte längre. Den ligger kvar i materialet, så att en sparad skylt
   * ritas i sin färg, men går varken att välja eller beställa. Det som säljs läses med
   * `offeredColors`.
   */
  discontinued?: boolean;
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
  /**
   * Materialet graveras inte: namn och logotyp printas (beslut av ägaren 2026-11-18 för
   * metallen). Då finns bara metoden "Endast print", se `markingFits`.
   */
  printOnly?: boolean;
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
  // Guld och silver ser ut som metall (besked från Pär via ägaren 2026-11-18, som såg guldet som
  // orange i ritningen). Färgkoden är verkstadens och är oförändrad.
  { id: "gold-black", name: "Guld / Svart", surface: "#D4A017", engraving: BLACK, metallic: true },
  { id: "silver-black", name: "Silver / Svart", surface: "#C5CDD4", engraving: BLACK, metallic: true },
  { id: "red-white", name: "Röd / Vit", surface: "#E31C23", engraving: WHITE },
  { id: "blue-white", name: "Blå / Vit", surface: "#0057B8", engraving: WHITE },
  { id: "darkblue-white", name: "Mörkblå / Vit", surface: "#003366", engraving: WHITE },
  { id: "green-white", name: "Grön / Vit", surface: "#00A33A", engraving: WHITE },
  { id: "darkgreen-white", name: "Mörkgrön / Vit", surface: "#006B2E", engraving: WHITE },
  { id: "orange-white", name: "Orange / Vit", surface: "#FF6A00", engraving: WHITE },
  { id: "white-blue", name: "Vit / Blå", surface: WHITE, engraving: "#0057B8" },
  { id: "white-red", name: "Vit / Röd", surface: WHITE, engraving: "#E31C23" },
  // Säljs inte längre (beslut av ägaren 2026-11-18: gul finns bara med svart gravyr).
  { id: "yellow-red", name: "Gul / Röd", surface: "#FFD200", engraving: "#E31C23", discontinued: true },
  { id: "gray-white", name: "Grå / Vit", surface: "#7A828C", engraving: WHITE },
  { id: "brown-white", name: "Brun / Vit", surface: "#8A4020", engraving: WHITE },
  { id: "darkbrown-white", name: "Mörkbrun / Vit", surface: "#4A2412", engraving: WHITE },
];

/** Finns bara i verkstadens 1,5 mm (deras `PLASTIC_15_COLOR_COMBOS`). */
const GREEN_BLACK: ColorCombo = { id: "green-black", name: "Grön / Svart", surface: "#00A33A", engraving: BLACK };

/**
 * Tvålagersplasten i 1,5 mm: alla verkstadens kombinationer, med deras id:n
 * och färgkoder (beslut av ägaren 2026-11-16). Alla kostar lika. De fyra
 * klassiska namnskyltsfärgerna står först, sedan följer verkstadens ordning.
 * Id:t skickas rakt av i ordern till verkstaden, så listan ska stämma med
 * deras; `src/lib/supplier/catalog-sync.test.ts` jämför när deras projekt
 * ligger bredvid på datorn.
 */
const PLASTIC_15_ORDER = [
  "white-black",
  "black-white",
  "gold-black",
  "silver-black",
  "yellow-black",
  "red-white",
  "blue-white",
  "darkblue-white",
  "green-white",
  "green-black",
  "darkgreen-white",
  "orange-white",
  "white-blue",
  "white-red",
  "yellow-red",
  "gray-white",
  "brown-white",
  "darkbrown-white",
] as const;

const PLASTIC_15_COLORS: readonly ColorCombo[] = PLASTIC_15_ORDER.map((id) => {
  const combo = [...PLASTIC_COLORS, GREEN_BLACK].find((c) => c.id === id);
  if (!combo) throw new Error(`Okänd plastfärg: ${id}`);
  return combo;
});

export const MATERIALS: readonly BadgeMaterial[] = [
  {
    // Ytorna och ämnena är verkstadens egna (underlag från ägaren 2026-11-17, se `BLANKS`).
    // Preliminärt tills verkstaden bekräftat: artikelkoden och gravyrens färg.
    id: "metal",
    name: "Metall",
    tagline: "Stilren, i tre ytor",
    description: "Tunn metallskylt med tryckt text och logotyp, i vit matt aluminium, mässing eller nickel.",
    finish: "aluminium",
    producer: "skylt-gravyr",
    exclusive: false,
    // Metallen graveras inte: namn och logotyp printas (beslut av ägaren 2026-11-18).
    printOnly: true,
    offered: true,
    precut: true,
    supplierCode: "namnskylt-metall",
    // Tjockleken skiljer mellan ytorna och står på ämnet (`blankArticle`). Den här gäller en äldre skylt utan ämne.
    thicknessMm: 0.5,
    priceClass: "premium",
    // Id:na är dem verkstadens mottagare känner (`metal-white`, `metal-gold`, `metal-silver`) och
    // skickas rakt av i ordern. Namnen är verkstadens ytor: vit matt aluminium, mässing och nickel.
    colors: [
      { id: "metal-white", name: "Vit matt", surface: "#F7F7F5", engraving: BLACK, lacquered: true },
      { id: "metal-gold", name: "Mässing", surface: "#C8A440", engraving: BLACK },
      { id: "metal-silver", name: "Nickel", surface: "#B4B6B8", engraving: BLACK },
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
    colors: PLASTIC_15_COLORS,
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

/** Typsnittens grupper i väljaren, i den ordning de visas. */
export type FontCategory = "sans" | "narrow" | "serif" | "rounded" | "script" | "display" | "mono";

export const FONT_CATEGORIES: readonly { id: FontCategory; name: string }[] = [
  { id: "sans", name: "Raka" },
  { id: "narrow", name: "Smala" },
  { id: "serif", name: "Med seriffer" },
  { id: "rounded", name: "Rundade" },
  { id: "script", name: "Skrivstil" },
  { id: "display", name: "Rubrikstil" },
  { id: "mono", name: "Skrivmaskin" },
];

export interface BadgeFont {
  id: FontId;
  name: string;
  category: FontCategory;
  /** Reservtypsnitt för `<text>` innan fontfilerna laddats. */
  css: string;
  /**
   * Verkstaden har typsnittet i sin egen motor, så en graverad rad skickas dit som text som
   * personalen kan ändra. Övriga typsnitt skickas som färdiga banor (besked från Mats på
   * verkstaden via ägaren 2026-11-20: typsnitten behöver inte begränsas, "så länge vi får
   * färdiga filer").
   */
  workshop: boolean;
  /**
   * Fontfiler under `public/fonts`. Verkstadens egna är samma filer som verkstaden bäddar in i
   * sina produktionsfiler, så att bokstäverna är identiska hos oss och i tillverkningen (beslut
   * av ägaren 2026-11-17): Arial ritas med Roboto och Arial Narrow med Roboto Condensed. De
   * extra typsnitten ligger i `google/`. Saknar typsnittet en fet stil är `bold` tom, och en
   * fet rad ritas då i normal stil.
   */
  files: { regular: string; bold: string | null };
}

const CATEGORY_CSS: Record<FontCategory, string> = {
  sans: "Arial, 'Helvetica Neue', Helvetica, sans-serif",
  narrow: "'Arial Narrow', 'Helvetica Neue Condensed', Arial, sans-serif",
  serif: "Georgia, 'Times New Roman', serif",
  rounded: "'Arial Rounded MT Bold', Arial, sans-serif",
  script: "'Snell Roundhand', 'Brush Script MT', cursive",
  display: "Impact, 'Arial Black', sans-serif",
  mono: "'SFMono-Regular', Menlo, Consolas, monospace",
};

/**
 * Verkstaden tillverkar Arial-familjen: namnen är verkstadens, och id:na skickas rakt av i
 * ordern. De står först i väljaren. Därefter de fria typsnitten ur `font-list.ts`.
 */
export const FONTS: readonly BadgeFont[] = [
  {
    id: "arial",
    name: "Arial",
    category: "sans",
    css: "Roboto, Arial, 'Helvetica Neue', Helvetica, sans-serif",
    workshop: true,
    files: { regular: "Roboto-Regular.ttf", bold: "Roboto-Bold.ttf" },
  },
  {
    id: "arial-narrow",
    name: "Arial Narrow",
    category: "narrow",
    css: "'Roboto Condensed', 'Arial Narrow', 'Helvetica Neue Condensed', Arial, sans-serif",
    workshop: true,
    files: { regular: "RobotoCondensed-Regular.ttf", bold: "RobotoCondensed-Bold.ttf" },
  },
  ...EXTRA_FONTS.map(
    (font): BadgeFont => ({
      id: font.id,
      name: font.name,
      category: font.category,
      css: `'${font.name}', ${CATEGORY_CSS[font.category]}`,
      workshop: false,
      files: { regular: `google/${font.regular}`, bold: font.bold ? `google/${font.bold}` : null },
    }),
  ),
];

export const FONT_IDS = FONTS.map((font) => font.id) as [FontId, ...FontId[]];

/**
 * Reservtypsnittet, Liberation Sans. Saknar radens typsnitt ett tecken ritas
 * hela raden i det här, precis som i verkstaden (deras `chooseFont`). Roboto
 * Condensed är en latinsk delmängd, så det gäller främst Arial Narrow.
 */
export const FALLBACK_FONT_FILES = { regular: "LiberationSans-Regular.ttf", bold: "LiberationSans-Bold.ttf" } as const;

export interface BadgeBlank {
  id: BlankId;
  name: string;
  shape: BadgeShape;
  widthMm: Mm;
  heightMm: Mm;
  /** Gäller bara `shape === "rounded"`. */
  cornerRadiusMm: Mm;
  /** Ämnet finns bara på material med de här ytorna. Utelämnat = alla material. */
  finishes?: readonly MaterialFinish[];
  /** Välvd: skylten är lätt kupad. Ritningen och måttet är desamma som för en plan skylt. */
  domed?: boolean;
  /**
   * Verkstadens artikel per yta, för färdiga ämnen: benämningen som den står
   * hos verkstaden, och plåtens tjocklek. Nyckeln är ytans id (`colorId`).
   */
  articles?: Readonly<Record<string, BlankArticle>>;
}

/** Ett färdigt ämne i en viss yta, som verkstaden har det på hyllan. */
export interface BlankArticle {
  name: string;
  thicknessMm: Mm;
}

const METAL: readonly MaterialFinish[] = ["aluminium"];
const PLASTIC: readonly MaterialFinish[] = ["plastic"];

/** Verkstadens tre ytor på ett metallämne, i samma ordning som i deras lista: vit matt aluminium, mässing och nickel. */
function metalArticles(white: string, brass: string, nickel: string, thinMm: Mm): Record<string, BlankArticle> {
  return {
    "metal-white": { name: white, thicknessMm: 0.8 },
    "metal-gold": { name: brass, thicknessMm: thinMm },
    "metal-silver": { name: nickel, thicknessMm: thinMm },
  };
}

/**
 * Ämnena som säljs. Ändra dem här, ingen annanstans.
 *
 * Metallens ämnen är verkstadens egna, med deras mått, tjocklek och
 * benämningar (underlag från ägaren 2026-11-17): fem format i tre ytor.
 * Benämningarna står ordagrant som i verkstadens lista och följer med ordern,
 * så att rätt ämne plockas. Hörnens rundning på rektanglarna och TV-brickans
 * form är uppskattade.
 *
 * Plastens format är oförändrade (ägarens besked samma dag): plasten skärs ur
 * ark, och skyltarna är desamma som på verkstadens egen sajt.
 */
export const BLANKS: readonly BadgeBlank[] = [
  {
    id: "metal-rectangle",
    name: "Rektangel",
    shape: "rounded",
    widthMm: 60,
    heightMm: 30,
    cornerRadiusMm: 3,
    finishes: METAL,
    articles: metalArticles("Namnskylt Vit alu matt 60x30", "Namnskylt Mässing 60x30", "Namnskylt Nickel 60x30", 0.51),
  },
  {
    id: "metal-rectangle-slim",
    name: "Smal rektangel",
    shape: "rounded",
    widthMm: 60,
    heightMm: 18,
    cornerRadiusMm: 2,
    finishes: METAL,
    articles: metalArticles("Namnskylt Vit alu matt 60x18", "Namnskylt Mässing 60x18", "Namnskylt Nickel 60x18", 0.51),
  },
  {
    id: "metal-tv",
    name: "TV-bricka",
    shape: "cushion",
    widthMm: 62,
    heightMm: 32,
    cornerRadiusMm: 0,
    finishes: METAL,
    articles: metalArticles("Namnskylt Alu Vit matt TV-bricka", "Namnskylt Mässing TV-Bricka", "Namnskylt Nickel TV-Bricka", 0.51),
  },
  {
    id: "metal-oval",
    name: "Oval",
    shape: "oval",
    widthMm: 63,
    heightMm: 32,
    cornerRadiusMm: 0,
    finishes: METAL,
    articles: metalArticles("Oval Alu Vit Matt 63 x 32mm", "Oval Alu Vit Matt 63 x 32 mm Mässing", "Oval Alu Vit Matt 63 x 32 mm Förnicklad", 0.5),
  },
  {
    id: "metal-oval-domed",
    name: "Oval, välvd",
    shape: "oval",
    widthMm: 59,
    heightMm: 34,
    cornerRadiusMm: 0,
    finishes: METAL,
    domed: true,
    articles: metalArticles("Oval Alu Vit matt 59x 34 mm Välvd", "Oval Mässing 59x 34 mm Välvd kant Mässing", "Oval Mässing 59x 34 mm Välvd kant Förnicklad", 0.5),
  },
  { id: "rectangle", name: "Rektangel", shape: "rounded", widthMm: 75, heightMm: 25, cornerRadiusMm: 3, finishes: PLASTIC },
  { id: "oval", name: "Oval", shape: "oval", widthMm: 70, heightMm: 40, cornerRadiusMm: 0, finishes: PLASTIC },
  { id: "rectangle-large", name: "Stor rektangel", shape: "rounded", widthMm: 75, heightMm: 45, cornerRadiusMm: 4, finishes: PLASTIC },
  { id: "cushion", name: "Kudde", shape: "cushion", widthMm: 75, heightMm: 35, cornerRadiusMm: 0, finishes: PLASTIC },
  // Formatet för klämman, som kräver minst 80 × 25 mm (beslut av ägaren 2026-11-16).
  { id: "rectangle-long", name: "Lång rektangel", shape: "rounded", widthMm: 80, heightMm: 25, cornerRadiusMm: 3, finishes: PLASTIC },
];

/** Sant när ämnet finns på materialet. Metallens ämnen är färdiga och har egna mått; plastens skärs ur ark. */
export function blankFits(blank: BadgeBlank, materialId: MaterialId): boolean {
  return !blank.finishes || blank.finishes.includes(getMaterial(materialId).finish);
}

/** Verkstadens artikel för ämnet i en viss yta, eller `null` när ämnet inte är ett färdigt ämne i den ytan. */
export function blankArticle(blank: BadgeBlank, colorId: string): BlankArticle | null {
  return blank.articles?.[colorId] ?? null;
}

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
  // Klämman finns bara på plastskyltar, och bara på en skylt som är stor nog (`clipOrientations`).
  {
    id: "clip",
    name: "Klämma",
    description: "Fäst på ficka, bälte eller band.",
    offered: true,
    finishes: ["plastic"],
    // Hårda mellanslag håller ihop måttet på en rad i det smala kortet.
    note: "Endast för plastskyltar på minst 80\u00a0×\u00a025\u00a0mm",
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

/** Materialets färger som säljs i dag. En kombination som har utgått ligger kvar i `colors` men är inte med här. */
export function offeredColors(material: Pick<BadgeMaterial, "colors">): readonly ColorCombo[] {
  return material.colors.filter((color) => !color.discontinued);
}

export function getColor(materialId: MaterialId, colorId: string): ColorCombo {
  const { colors } = getMaterial(materialId);
  return colors.find((c) => c.id === colorId) ?? colors[0]!;
}

export function isPartnerMade(id: MaterialId): boolean {
  return getMaterial(id).producer === "quickbutton";
}

const FONT_BY_ID = new Map(FONTS.map((font) => [font.id, font]));

export function getFont(id: FontId): BadgeFont {
  return FONT_BY_ID.get(id) ?? FONTS[0]!;
}

/** Har typsnittet en egen fet stil? Annars ritas en fet rad i normal stil. */
export function hasBold(id: FontId): boolean {
  return getFont(id).files.bold !== null;
}

export function getMounting(id: MountingId): Mounting {
  return MOUNTINGS.find((m) => m.id === id) ?? MOUNTINGS[0]!;
}

/**
 * Sant när fästet går att få på materialet. De flesta fästen finns på alla;
 * klämman bara på plast. Måttet prövas för sig: se `mountingFitsDocument`.
 */
export function mountingFits(mountingId: MountingId, materialId: MaterialId): boolean {
  const { finishes } = getMounting(mountingId);
  return !finishes || finishes.includes(getMaterial(materialId).finish);
}

/**
 * Klämmans minsta skylt (beslut av ägaren 2026-11-16): 80 × 25 mm när klämman
 * ligger längs skylten, 25 × 80 mm när den sitter på höjden. Gäller alla
 * former, även egen form, och räknas på skyltens mått.
 */
export const CLIP_MIN = { longMm: 80, shortMm: 25 } as const;

export const CLIP_ORIENTATIONS: readonly { id: ClipOrientation; name: string }[] = [
  { id: "horizontal", name: "Horisontellt" },
  { id: "vertical", name: "Vertikalt" },
];

/** Riktningarna klämman kan sitta i på en skylt med det här måttet. Tom lista = klämman ryms inte. */
export function clipOrientations(size: { widthMm: Mm; heightMm: Mm }): ClipOrientation[] {
  const fits = (longMm: Mm, shortMm: Mm) => longMm >= CLIP_MIN.longMm && shortMm >= CLIP_MIN.shortMm;
  return CLIP_ORIENTATIONS.map((o) => o.id).filter((id) =>
    id === "horizontal" ? fits(size.widthMm, size.heightMm) : fits(size.heightMm, size.widthMm),
  );
}
