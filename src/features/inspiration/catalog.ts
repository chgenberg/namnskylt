import {
  SHAPES,
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

function shapeName(doc: BadgeDocument): string {
  return SHAPES.find((s) => s.id === doc.shape)?.name ?? doc.shape;
}

function specs(doc: BadgeDocument): string[] {
  const material = getMaterial(doc.materialId);
  const color = getColor(doc.materialId, doc.colorId);
  return [
    `${material.name}, ${material.thicknessMm} mm`,
    `${color.name}`,
    `${shapeName(doc)} · ${doc.size.widthMm} × ${doc.size.heightMm} mm`,
    `Fäste: ${getMounting(doc.mounting).name}`,
  ];
}

function entry(
  slug: string,
  fields: Omit<InspirationEntry, "slug" | "photo" | "photoWidth" | "photoHeight" | "doc" | "highlights">,
): InspirationEntry {
  const doc = documentOf(slug);
  return {
    slug,
    photo: `/inspiration/${slug}.jpg`,
    photoWidth: 1024,
    photoHeight: 1536,
    highlights: specs(doc),
    doc,
    ...fields,
  };
}

export const INSPIRATION: readonly InspirationEntry[] = [
  entry("ikea", {
    company: "IKEA",
    industry: "Möbelhandel",
    accent: "#FFDA1A",
    title: "Gul epoxy i butiksgolvet",
    lead: "Lisa Andersson, säljare — IKEA:s gula i en blank, reptålig kupol.",
    body: "Tvålagers epoxyemalj i gul metallic med svart gravyr. Loggan sitter ovanför namnet så den syns redan på avstånd i varuhuset. Kupolen tål klädställningar, kundvagnar och daglig hantering — och skyddsfodral ingår.",
  }),
  entry("ericsson", {
    company: "Ericsson",
    industry: "Telekom",
    accent: "#002561",
    title: "Rostfritt i labbet",
    lead: "Erik Johansson, nätverksingenjör — syrafast stål med lasermärkt logga.",
    body: "Rak skylt i rostfritt stål, lasermärkt så gravyren sitter kvar efter sprit, disk och slitage. Loggan ligger ovanför namnet. Passar labb, fält och serverhall — där plast snabbt ser sliten ut.",
  }),
  entry("spotify", {
    company: "Spotify",
    industry: "Tech",
    accent: "#1ED760",
    title: "Svart akryl på kontoret",
    lead: "Sara Lindqvist, product designer — matt svart akryl med ikonen till vänster.",
    body: "Tre millimeter matt svart akryl över en färgad botten, kapselformad. Den runda ikonen sitter till vänster om namnet så skylten känns som resten av varumärket. Akrylen ger ett mjukt skuggspel som lyfter från en vanlig plastskylt.",
  }),
  entry("scandic", {
    company: "Scandic",
    industry: "Hotell",
    accent: "#C9A227",
    title: "Mässing i receptionen",
    lead: "Anna Berg, receptionist — massiv mässing i guld, den klassiska hotellskylten.",
    body: "Polerad mässing med svartfylld gravyr och loggan ovanför namnet. Magnetfäste så kavajen inte får hål. Den här finishen är den som gäster förknippar med en reception — och den som nu är standard i skyltmotorn.",
  }),
  entry("ica", {
    company: "ICA",
    industry: "Dagligvaror",
    accent: "#E31C23",
    title: "Röd gravyrplast i butiken",
    lead: "Johan Nilsson, butikschef — ICA-rött med vit logga och smalt typsnitt.",
    body: "Tvålagers gravyrplast i rött med vit kärna. Loggan står till vänster och Arial Narrow rymmer både namn och titel. Magnetfäste så skjortan håller. Det är den mest prisvärda vägen till en skylt i företagets färg — 17 färger att välja bland.",
  }),
  entry("sas", {
    company: "SAS",
    industry: "Flyg",
    accent: "#002F6C",
    title: "Aluminium på uniformen",
    lead: "Karin Holm, kabinpersonal — massiv aluminium i silver, lätt att bära en hel dag.",
    body: "Massiv aluminium i silverfinish med svartfylld gravyr. Loggan ovanför namnet, rundade hörn, magnet så uniformen håller. Aluminiumet väger ungefär hälften av mässing och tål ändå en lång rutt.",
  }),
  entry("max", {
    company: "MAX",
    industry: "Restaurang",
    accent: "#C8102E",
    title: "Röd epoxy bakom disken",
    lead: "Ali Hassan, skiftledare — blank röd kupol med kronan till vänster.",
    body: "Epoxy i röd metallic, kapselformad, med MAX-kronan till vänster om namnet. Kupolen är extra tålig mot repor, fett och disk. Klämman sitter på förklädet eller fickan — inget hål i tröjan.",
  }),
  entry("clas-ohlson", {
    company: "Clas Ohlson",
    industry: "Detaljhandel",
    accent: "#F47B20",
    title: "Oval aluminium i hyllan",
    lead: "Emma Svensson, butikssäljare — borstad aluminium i en oval som sticker ut.",
    body: "Eloxerad, borstad aluminium med svartfylld gravyr. Ovalen ger mer yta åt loggan ovanför namnet utan att skylten blir högre. Lätt, tålig och diskret — den sortens skylt som håller en hel säsong i butik.",
  }),
];
