import {
  shapeLabel,
  badgeDocumentSchema,
  getColor,
  getMaterial,
  getMounting,
  type BadgeDocument,
} from "@/engine";
import rawBadges from "./badges.json";

export interface InspirationEntry {
  slug: string;
  company: string;
  industry: string;
  /** Varumärkesfärg som ramens accent. */
  accent: string;
  photo: string;
  /** Skylten fotograferad i 3D-motorns fotoläge, 1200 × 750. */
  badgePhoto: string;
  photoWidth: number;
  photoHeight: number;
  title: string;
  lead: string;
  body: string;
  highlights: readonly string[];
  doc: BadgeDocument;
}

const RAW = rawBadges as Record<string, unknown>;

function documentOf(slug: string): BadgeDocument {
  const parsed = badgeDocumentSchema.safeParse(RAW[slug]);
  if (!parsed.success) throw new Error(`Ogiltig inspirationsskylt: ${slug}`);
  return parsed.data;
}

function specs(doc: BadgeDocument): string[] {
  const material = getMaterial(doc.materialId);
  const color = getColor(doc.materialId, doc.colorId);
  return [
    `${material.name}, ${material.thicknessMm} mm`,
    `${color.name}`,
    `${shapeLabel(doc)} · ${doc.size.widthMm} × ${doc.size.heightMm} mm`,
    `Fäste: ${getMounting(doc.mounting).name}`,
  ];
}

function entry(
  slug: string,
  fields: Omit<InspirationEntry, "slug" | "photo" | "badgePhoto" | "photoWidth" | "photoHeight" | "doc" | "highlights">,
): InspirationEntry {
  const doc = documentOf(slug);
  return {
    slug,
    photo: `/inspiration/${slug}.jpg`,
    badgePhoto: `/inspiration/${slug}-badge.jpg`,
    photoWidth: 1024,
    photoHeight: 1536,
    highlights: specs(doc),
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
    title: "Borstat guld i receptionen",
    lead: "Anna Berg, receptionist — borstat guld, den klassiska hotellskylten.",
    body: "Metallskylt i borstat guld med svart gravyr och loggan ovanför namnet. Magnetfäste så kavajen inte får hål. Guld är den yta gäster förknippar med en reception.",
  }),
  entry("ericsson", {
    company: "Ericsson",
    industry: "Telekom",
    accent: "#002561",
    title: "Borstat silver i labbet",
    lead: "Erik Johansson, nätverksingenjör — borstat silver med graverad logga.",
    body: "Rektangulär metallskylt i borstat silver med svart gravyr. Loggan ligger ovanför namnet och titeln står under. En stram skylt som passar labb, fält och serverhall.",
  }),
  entry("sas", {
    company: "SAS",
    industry: "Flyg",
    accent: "#002F6C",
    title: "Borstat silver på uniformen",
    lead: "Karin Holm, kabinpersonal — tunn metall som är lätt att bära en hel dag.",
    body: "Tunn metallskylt i borstat silver med svart gravyr. Loggan ovanför namnet, rundade hörn och magnet så uniformen håller.",
  }),
  entry("clas-ohlson", {
    company: "Clas Ohlson",
    industry: "Detaljhandel",
    accent: "#F47B20",
    title: "Oval i butiken",
    lead: "Emma Svensson, butikssäljare — borstat silver i en oval som sticker ut.",
    body: "Oval metallskylt i borstat silver med svart gravyr. Ovalen ger mer höjd åt loggan ovanför namnet. Diskret, tydlig och lätt att känna igen i butiken.",
  }),
];
