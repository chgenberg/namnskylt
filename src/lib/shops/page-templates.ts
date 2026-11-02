import { newId, pathFor, type Block, type BlockKind, type ShopPage } from "./content";

/**
 * Färdiga undersidor att börja från. Texterna nämner bara det som stämmer i
 * varje butik — leveranstid, korrektur, material och mängdrabatt — och
 * återförsäljaren skriver om resten.
 */
export const PAGE_TEMPLATE_IDS = ["blank", "about", "contact", "faq", "materials", "references", "how", "campaign"] as const;
export type PageTemplateId = (typeof PAGE_TEMPLATE_IDS)[number];

export interface PageTemplate {
  id: PageTemplateId;
  label: string;
  description: string;
  /** Blocken mallen börjar med, för kortets miniatyr. */
  blocks: BlockKind[];
  /** Exempelbilder på skyltar med butikens namn, ritade när sidan skapas. */
  showcaseImages: number;
}

export const PAGE_TEMPLATES: readonly PageTemplate[] = [
  { id: "blank", label: "Tom sida", description: "Börja från noll och bygg sidan själv.", blocks: [], showcaseImages: 0 },
  {
    id: "about",
    label: "Om oss",
    description: "Er historia, hantverket och varför kunderna väljer er.",
    blocks: ["header", "text", "imageText", "steps", "contact"],
    showcaseImages: 2,
  },
  {
    id: "contact",
    label: "Kontakt",
    description: "Kontaktuppgifter, karta och de vanligaste frågorna.",
    blocks: ["header", "contact", "map", "faq"],
    showcaseImages: 0,
  },
  {
    id: "faq",
    label: "Vanliga frågor",
    description: "Leveranstid, korrektur, material, fästen och logga.",
    blocks: ["header", "faq", "banner"],
    showcaseImages: 0,
  },
  {
    id: "materials",
    label: "Material och sortiment",
    description: "Skyltar i fyra material med ert namn — och vad som skiljer dem.",
    blocks: ["header", "gallery", "steps", "imageText"],
    showcaseImages: 4,
  },
  {
    id: "references",
    label: "Referenser",
    description: "Bilder på skyltar ni levererat och kunder ni jobbat med.",
    blocks: ["header", "gallery", "text", "banner"],
    showcaseImages: 0,
  },
  {
    id: "how",
    label: "Så beställer du",
    description: "Fyra steg från namn till färdig skylt.",
    blocks: ["header", "steps", "faq", "banner"],
    showcaseImages: 0,
  },
  {
    id: "campaign",
    label: "Kampanj",
    description: "En erbjudandesida med kampanjremsa och tydlig knapp.",
    blocks: ["banner", "header", "imageText", "steps"],
    showcaseImages: 1,
  },
];

export function pageTemplate(id: string): PageTemplate | null {
  return PAGE_TEMPLATES.find((t) => t.id === id) ?? null;
}

export interface TemplateShop {
  slug: string;
  name: string;
  tagline: string;
  address: string;
}

/** Materialen exempelbilderna visar, i den ordning de ritas. */
export const SHOWCASE_MATERIALS = [
  { materialId: "brass", colorId: "brass-gold", name: "Mässing", line: "Klassisk och elegant" },
  { materialId: "aluminium-anodized", colorId: "alu-natural-black", name: "Borstad aluminium", line: "Diskret och exklusiv" },
  { materialId: "acrylic", colorId: "acrylic-white", name: "Akryl", line: "Djup och skuggspel" },
  { materialId: "plastic-2-layer", colorId: "black-white", name: "Gravyrplast", line: "Prisvärd, i 17 färger" },
] as const;

const ORDER_STEPS = [
  { title: "Skriv namnen", text: "Ett namn per rad — eller ladda upp hela teamet från en Excel-lista." },
  { title: "Välj material och fäste", text: "Se skylten i 3D medan du väljer. Lägg till er logga om ni vill." },
  { title: "Godkänn korrekturen", text: "Du får se varje skylt innan något graveras." },
  { title: "Få skyltarna", text: "Skyltarna graveras och skickas inom fem arbetsdagar." },
];

const FAQ = [
  { question: "Hur lång är leveranstiden?", answer: "Skyltarna graveras och skickas inom fem arbetsdagar efter att korrekturen är godkänd." },
  { question: "Får jag se skylten innan den graveras?", answer: "Ja. Du ser skylten i 3D när du beställer och godkänner en korrektur innan något graveras." },
  { question: "Kan jag beställa till hela teamet på en gång?", answer: "Ja. Skriv ett namn per rad eller ladda upp en Excel-lista — namn och titel hittas automatiskt." },
  { question: "Vilka material finns?", answer: "Mässing, akryl, massiv och borstad aluminium, rostfritt stål, epoxy och gravyrplast i 17 färger." },
  { question: "Vilka fästen kan jag välja?", answer: "Nål, magnet, klämma eller säkerhetsnål. Magneten är skonsam mot kläderna." },
  { question: "Kan vår logga graveras på skylten?", answer: "Ja. Ladda upp loggan i skyltmotorn så graveras den tillsammans med texten." },
  { question: "Blir det billigare om vi beställer fler?", answer: "Ja, det finns mängdrabatt från tio skyltar — ju fler, desto lägre pris per skylt." },
  { question: "Kan jag ändra något efter beställningen?", answer: "Säg till innan du godkänt korrekturen, så rättar vi. Efter godkännandet går skyltarna direkt till gravyr." },
];

const pick = <T,>(list: readonly T[], indexes: readonly number[]) => indexes.flatMap((i) => (list[i] ? [list[i]] : []));

/** Mallens block, med butikens namn och — för mallar med exempelbilder — bilderna i den ordning de ritades. */
export function templateBlocks(id: PageTemplateId, shop: TemplateShop, imageIds: readonly string[] = []): Block[] {
  const b = () => newId();
  const create = `/butik/${shop.slug}/skapa`;
  const image = (i: number) => imageIds[i] ?? null;
  switch (id) {
    case "blank":
      return [];
    case "about":
      return [
        {
          kind: "header",
          id: b(),
          title: `Om ${shop.name}`,
          lead: shop.tagline || "Vi hjälper företag att se proffsiga ut — hela vägen till namnskylten.",
          imageId: image(0),
          align: "left",
        },
        {
          kind: "text",
          id: b(),
          title: "Vår historia",
          text: `Berätta hur ${shop.name} började, vilka ni är och vad ni brinner för. Kunderna köper av människor — visa vilka som står bakom.`,
        },
        {
          kind: "imageText",
          id: b(),
          imageId: image(1),
          imageSide: "right",
          title: "Gjort för att synas",
          text: "Varje skylt graveras i Sverige med det namn och den titel ni skriver. Ni ser den i 3D innan ni beställer och godkänner en korrektur innan något graveras.",
          buttonLabel: "Skapa er skylt",
          buttonHref: create,
        },
        {
          kind: "steps",
          id: b(),
          title: "Därför väljer kunderna oss",
          items: [
            { title: "Snabbt", text: "Skyltarna graveras och skickas inom fem arbetsdagar." },
            { title: "Rätt från början", text: "Korrektur innan gravyr — inga stavfel på skylten." },
            { title: "Hela teamet", text: "Alla namn på en gång, eller direkt från en Excel-lista." },
          ],
        },
        { kind: "contact", id: b(), title: "Hör av er", text: "Vill ni veta mer, eller beställa till många på en gång? Vi hjälper gärna till." },
      ];
    case "contact":
      return [
        {
          kind: "header",
          id: b(),
          title: "Kontakta oss",
          lead: "Frågor om skyltar, större beställningar eller en offert — vi svarar gärna.",
          imageId: null,
          align: "center",
        },
        { kind: "contact", id: b(), title: `Så når ni ${shop.name}`, text: "Ring, mejla eller kom förbi. Skyltar beställer ni enklast direkt här i butiken." },
        { kind: "map", id: b(), title: "Hitta hit", address: shop.address },
        { kind: "faq", id: b(), title: "Innan du hör av dig", items: pick(FAQ, [0, 1, 6]) },
      ];
    case "faq":
      return [
        { kind: "header", id: b(), title: "Vanliga frågor", lead: "Det mesta kunderna undrar över innan de beställer.", imageId: null, align: "left" },
        { kind: "faq", id: b(), title: "", items: [...FAQ] },
        { kind: "banner", id: b(), text: "Redo? Skapa er skylt och se den i 3D direkt", href: create, until: "" },
      ];
    case "materials":
      return [
        {
          kind: "header",
          id: b(),
          title: "Material och sortiment",
          lead: "Från klassisk mässing till prisvärd gravyrplast — alla graverade med ert namn.",
          imageId: null,
          align: "left",
        },
        { kind: "gallery", id: b(), title: "", images: imageIds.slice(0, SHOWCASE_MATERIALS.length) },
        {
          kind: "steps",
          id: b(),
          title: "Vilket material passar er?",
          items: SHOWCASE_MATERIALS.map((m) => ({ title: m.name, text: m.line })),
        },
        {
          kind: "imageText",
          id: b(),
          imageId: null,
          imageSide: "left",
          title: "Se skillnaden i 3D",
          text: "Välj material, färg, form och fäste — och se skylten precis som den blir innan ni beställer.",
          buttonLabel: "Prova i skyltmotorn",
          buttonHref: create,
        },
      ];
    case "references":
      return [
        { kind: "header", id: b(), title: "Referenser", lead: "Några av de skyltar vi levererat — och kunderna som bär dem.", imageId: null, align: "left" },
        { kind: "gallery", id: b(), title: "Skyltar vi har levererat", images: [] },
        { kind: "text", id: b(), title: "Några av våra kunder", text: "Skriv vilka ni jobbar med — gärna med ett kort citat från en nöjd kund." },
        { kind: "banner", id: b(), text: "Vill ni också ha skyltar som syns? Skapa er skylt", href: create, until: "" },
      ];
    case "how":
      return [
        { kind: "header", id: b(), title: "Så beställer du", lead: "Från namn till färdig skylt i fyra steg.", imageId: null, align: "left" },
        { kind: "steps", id: b(), title: "", items: ORDER_STEPS.map((s) => ({ ...s })) },
        { kind: "faq", id: b(), title: "Bra att veta", items: pick(FAQ, [1, 2, 5]) },
        { kind: "banner", id: b(), text: "Börja med att skriva ett namn", href: create, until: "" },
      ];
    case "campaign":
      return [
        { kind: "banner", id: b(), text: "Kampanj — skriv erbjudandet här", href: create, until: "" },
        {
          kind: "header",
          id: b(),
          title: "Nya namnskyltar till hela teamet",
          lead: "Beskriv erbjudandet: vad det gäller, för vem och hur länge.",
          imageId: null,
          align: "center",
        },
        {
          kind: "imageText",
          id: b(),
          imageId: image(0),
          imageSide: "right",
          title: "Klart på fem arbetsdagar",
          text: "Skriv namnen, se skyltarna i 3D och godkänn korrekturen. Sedan graverar vi och skickar.",
          buttonLabel: "Skapa skyltar",
          buttonHref: create,
        },
        { kind: "steps", id: b(), title: "Så går det till", items: ORDER_STEPS.slice(0, 3).map((s) => ({ ...s })) },
      ];
  }
}

export function templatePage(id: PageTemplateId, label: string, shop: TemplateShop, takenPaths: readonly string[], imageIds: readonly string[] = []): ShopPage {
  const name = label.trim().slice(0, 30) || pageTemplate(id)?.label || "Ny sida";
  return { id: newId("p"), path: pathFor(name, takenPaths), label: name, blocks: templateBlocks(id, shop, imageIds) };
}
