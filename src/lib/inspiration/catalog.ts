import {
  shapeLabel,
  badgeDocumentSchema,
  getColor,
  getMarkingMethod,
  getMaterial,
  markingOf,
  thicknessOf,
  mountingLabel,
  type BadgeDocument,
} from "@/engine";
import rawBadges from "./badges.json";

/**
 * En närbild på ett av valen i exemplet (besked från Pär via ägaren 2026-11-20: närbilder på de val
 * vi har gjort, till höger om varje bild, "tydligt och enkelt överskådat"). Bilderna är tagna ur
 * skyltmotorns 3D-vy, 960 × 720: ytan inzoomad, skylten rakt framifrån och baksidan med fästet.
 */
export interface InspirationDetail {
  kind: "surface" | "shape" | "mounting";
  /** Vad valet gäller: Yta, Form eller Fäste. */
  label: string;
  /** Det som är valt, till exempel "Mässing" eller "Magnet". */
  value: string;
  image: string;
  alt: string;
}

/** Närbildernas mått. */
export const DETAIL_IMAGE = { width: 960, height: 720 } as const;

export interface InspirationEntry {
  slug: string;
  company: string;
  industry: string;
  /** Varumärkesfärg som ramens accent. */
  accent: string;
  photo: string;
  photoWidth: number;
  photoHeight: number;
  title: string;
  /** En rad om vem som bär skylten och varför den ser ut så. */
  lead: string;
  /** Valen i exemplet, vart och ett med sin närbild: ytan, formen och fästet. */
  details: readonly InspirationDetail[];
  /** Märkningsmetoden, läst ur skylten: "Endast gravyr", "Namn graveras · logotyp printas" och så vidare. */
  marking: string;
  doc: BadgeDocument;
}

const RAW = rawBadges as Record<string, unknown>;

function documentOf(slug: string): BadgeDocument {
  const parsed = badgeDocumentSchema.safeParse(RAW[slug]);
  if (!parsed.success) throw new Error(`Ogiltig inspirationsskylt: ${slug}`);
  return parsed.data;
}

/** Valen läses ur skylten själv, så att texten under närbilden alltid stämmer med skylten som går att beställa. */
function details(slug: string, doc: BadgeDocument): InspirationDetail[] {
  const material = getMaterial(doc.materialId);
  const color = getColor(doc.materialId, doc.colorId);
  const shape = `${shapeLabel(doc)} ${doc.size.widthMm} × ${doc.size.heightMm} mm`;
  const mounting = mountingLabel(doc);
  return [
    {
      kind: "surface",
      label: "Yta",
      value: `${color.name} · ${material.name.toLowerCase()} ${thicknessOf(doc).toLocaleString("sv-SE")} mm`,
      image: `/inspiration/${slug}-yta.jpg`,
      alt: `Närbild på ytan: ${color.name.toLowerCase()}`,
    },
    { kind: "shape", label: "Form", value: shape, image: `/inspiration/${slug}-form.jpg`, alt: `Skylten rakt framifrån: ${shape.toLowerCase()}` },
    { kind: "mounting", label: "Fäste", value: mounting, image: `/inspiration/${slug}-faste.jpg`, alt: `Skyltens baksida med fästet: ${mounting.toLowerCase()}` },
  ];
}

function entry(
  slug: string,
  fields: Omit<InspirationEntry, "slug" | "photo" | "photoWidth" | "photoHeight" | "doc" | "details" | "marking">,
): InspirationEntry {
  const doc = documentOf(slug);
  return {
    slug,
    photo: `/inspiration/${slug}.jpg`,
    photoWidth: 1024,
    photoHeight: 1536,
    details: details(slug, doc),
    marking: getMarkingMethod(markingOf(doc)).name,
    doc,
    ...fields,
  };
}

/** Bara skyltar ur dagens sortiment — "Gör en liknande" ska ge samma skylt som på bilden. */
export const INSPIRATION: readonly InspirationEntry[] = [
  entry("scandic", {
    company: "Scandic",
    industry: "Hotell",
    accent: "#C9A227",
    title: "Mässing i receptionen",
    lead: "Anna Berg, receptionist. Mässing med svart tryck, den klassiska hotellskylten, och magnet så att kavajen inte får hål.",
  }),
  entry("ericsson", {
    company: "Ericsson",
    industry: "Telekom",
    accent: "#002561",
    title: "Nickel i labbet",
    lead: "Erik Johansson, nätverksingenjör. Nickel med loggan i svart: en stram skylt för labb, fält och serverhall.",
  }),
  entry("sas", {
    company: "SAS",
    industry: "Flyg",
    accent: "#002F6C",
    title: "Nickel på uniformen",
    lead: "Karin Holm, kabinpersonal. Tunn metall som är lätt att bära en hel dag, med magnet så att uniformen håller.",
  }),
  entry("clas-ohlson", {
    company: "Clas Ohlson",
    industry: "Detaljhandel",
    accent: "#F47B20",
    title: "Oval i butiken",
    lead: "Emma Svensson, butikssäljare. En oval i nickel sticker ut i butiken, och ger loggan mer höjd ovanför namnet.",
  }),
  // Fyra i plast (besked via ägaren 2026-11-21): den klassiska med klämma, en med nål där allt graveras,
  // en med magnet där namnet graveras och loggan printas, och en i egen form.
  entry("lakare", {
    company: "Capio",
    industry: "Vård",
    accent: "#111111",
    title: "Klassisk vit plast i vården",
    lead: "Maria Lindberg, leg. läkare. Vit plast med svart gravyr, den klassiska namnskylten. Klämman fäster på fickan eller kragen, utan hål i tyget.",
  }),
  entry("ica", {
    company: "ICA",
    industry: "Dagligvaror",
    accent: "#E31C23",
    title: "Röd plast i butiken",
    lead: "Johan Nilsson, butikschef. Namn och logga är graverade: gravyren frilägger plastens vita kärna. Nål på baksidan.",
  }),
  entry("ikea", {
    company: "IKEA",
    industry: "Möbelhandel",
    accent: "#FFDA1A",
    title: "Gul plast med printad logga",
    lead: "Lisa Andersson, säljare. Namnet är graverat i svart och loggan printad i blått ovanför. Magnet så att tröjan inte får hål.",
  }),
  entry("bil", {
    company: "Bilia",
    industry: "Bilhandel",
    accent: "#0057B8",
    title: "Egen form i bilhallen",
    lead: "Oscar Lund, bilsäljare. Plasten skärs ur ark och kan få vilken form som helst: här en bil i blått med vit gravyr.",
  }),
];
