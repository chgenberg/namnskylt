import { z } from "zod";

/**
 * Butikens sidor. Startsidan — skyltmotorns hero och stegen — är densamma i
 * alla butiker och går inte att ändra, bara färg, logga och typsnitt följer
 * butiken. Undersidorna (Om oss, Kontakt …) bygger återförsäljaren fritt av
 * block. Bara text och bilder — aldrig HTML — så att ingen sida kan gå sönder
 * eller bära skadlig kod.
 */
export const BLOCK_KINDS = ["header", "text", "imageText", "gallery", "steps", "faq", "banner", "contact"] as const;
export type BlockKind = (typeof BLOCK_KINDS)[number];

export const BLOCK_LABEL: Record<BlockKind, string> = {
  header: "Sidrubrik",
  text: "Text",
  imageText: "Bild och text",
  gallery: "Bildgalleri",
  steps: "Så funkar det",
  faq: "Vanliga frågor",
  banner: "Kampanjremsa",
  contact: "Kontakt",
};

export const MAX_PAGES = 8;
export const MAX_BLOCKS_PER_PAGE = 20;
export const MAX_GALLERY_IMAGES = 12;
export const MAX_FAQ_ITEMS = 12;
export const MAX_STEPS = 4;

const ID = /^[A-Za-z0-9_-]{4,32}$/;
export const IMAGE_ID = /^[A-Za-z0-9_-]{10,40}$/;
export const PAGE_PATH = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
/** Butikens egna adresser — en sida får inte heta som dem. */
export const RESERVED_PATHS = new Set([
  "skapa", "logo", "ikon", "mejlbild", "bild", "forhandsvisning", "api", "admin", "korrektur", "offert", "inbaddning",
]);
/** Länkar till webbsidor, egna sidor, ankare, mejl och telefon — inget javascript:. */
const HREF = /^(https?:\/\/[^\s<>"]+|\/[^\s<>"]*|#[\w-]*|mailto:[^\s<>"]+|tel:[+\d\s-]+)$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

const text = (max: number) =>
  z
    .string()
    .max(max)
    .transform((s) => s.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000b-\u001f]/g, ""));
const line = (max: number) =>
  z
    .string()
    .max(max)
    .transform((s) => s.replace(/\s+/g, " ").trim());
const href = z
  .string()
  .max(300)
  .refine((s) => s.trim() === "" || HREF.test(s.trim()), "Ogiltig länk")
  .transform((s) => s.trim());
const imageRef = z.string().regex(IMAGE_ID);
const id = z.string().regex(ID);

export const blockSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("header"),
    id,
    title: line(80),
    lead: text(300),
    imageId: imageRef.nullable(),
    align: z.enum(["left", "center"]),
  }),
  z.object({ kind: z.literal("text"), id, title: line(80), text: text(2000) }),
  z.object({
    kind: z.literal("imageText"),
    id,
    imageId: imageRef.nullable(),
    imageSide: z.enum(["left", "right"]),
    title: line(80),
    text: text(800),
    buttonLabel: line(40),
    buttonHref: href,
  }),
  z.object({ kind: z.literal("gallery"), id, title: line(80), images: z.array(imageRef).max(MAX_GALLERY_IMAGES) }),
  z.object({
    kind: z.literal("steps"),
    id,
    title: line(80),
    items: z.array(z.object({ title: line(60), text: text(280) })).min(1).max(MAX_STEPS),
  }),
  z.object({
    kind: z.literal("faq"),
    id,
    title: line(80),
    items: z.array(z.object({ question: line(140), answer: text(600) })).min(1).max(MAX_FAQ_ITEMS),
  }),
  z.object({
    kind: z.literal("banner"),
    id,
    text: line(160),
    href,
    /** Sista dagen remsan visas; tom = tills vidare. */
    until: z.string().refine((s) => s === "" || DAY.test(s), "Datum som ÅÅÅÅ-MM-DD"),
  }),
  z.object({ kind: z.literal("contact"), id, title: line(80), text: text(400) }),
]);

export type Block = z.infer<typeof blockSchema>;
export type BlockOf<K extends BlockKind> = Extract<Block, { kind: K }>;

export const pageSchema = z.object({
  id,
  /** Tom = startsidan; annars adressen efter butiken, t.ex. "om-oss". */
  path: z.string().refine((p) => p === "" || (PAGE_PATH.test(p) && !RESERVED_PATHS.has(p)), "Ogiltig adress"),
  /** Menyvalet. */
  label: line(30),
  blocks: z.array(blockSchema).max(MAX_BLOCKS_PER_PAGE),
});

export type ShopPage = z.infer<typeof pageSchema>;

export const shopContentSchema = z
  .object({ version: z.literal(2), pages: z.array(pageSchema).min(1).max(MAX_PAGES) })
  .refine((c) => c.pages[0]?.path === "", "Första sidan är startsidan")
  .refine((c) => c.pages.filter((p) => p.path === "").length === 1, "Bara en startsida")
  .refine((c) => new Set(c.pages.map((p) => p.path)).size === c.pages.length, "Två sidor har samma adress")
  .refine((c) => {
    const ids = [...c.pages.map((p) => p.id), ...c.pages.flatMap((p) => p.blocks.map((b) => b.id))];
    return new Set(ids).size === ids.length;
  }, "Två delar har samma id");

export type ShopContent = z.infer<typeof shopContentSchema>;

const DEFAULT_STEPS: BlockOf<"steps">["items"] = [
  { title: "Skriv namnet", text: "Börja med namn och titel. Hela teamet går att lägga till på en gång — en rad per person." },
  { title: "Se skylten i 3D", text: "Välj material, färg, form och fäste. Lägg till er logga så graveras den med texten." },
  { title: "Beställ", text: "Skyltarna graveras och skickas inom fem arbetsdagar. Korrektur innan gravyr ingår." },
];

let counter = 0;
/** Kort, unikt id — samma regler i webbläsaren och på servern. */
export function newId(prefix = "b"): string {
  counter = (counter + 1) % 1_000_000;
  return `${prefix}${Date.now().toString(36)}${counter.toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`.slice(0, 24);
}

/** Det varje butik hade innan editorn fanns: startsidan med tre steg. */
export function defaultContent(): ShopContent {
  return {
    version: 2,
    pages: [
      {
        id: "start",
        path: "",
        label: "Hem",
        // Utan rubrik, som stegen alltid sett ut under skylten.
        blocks: [{ kind: "steps", id: "sa-funkar-det", title: "", items: DEFAULT_STEPS.map((s) => ({ ...s })) }],
      },
    ],
  };
}

export function newBlock(kind: BlockKind, title?: string): Block {
  const blockId = newId();
  switch (kind) {
    case "header":
      return { kind, id: blockId, title: title ?? "Rubrik", lead: "En kort ingress om vad sidan handlar om.", imageId: null, align: "left" };
    case "text":
      return { kind, id: blockId, title: "Om oss", text: "Berätta vilka ni är och varför kunderna ska välja er." };
    case "imageText":
      return { kind, id: blockId, imageId: null, imageSide: "right", title: "Rubrik", text: "Berätta något om er.", buttonLabel: "", buttonHref: "" };
    case "gallery":
      return { kind, id: blockId, title: "Skyltar vi har gjort", images: [] };
    case "steps":
      return { kind, id: blockId, title: "Så funkar det", items: DEFAULT_STEPS.map((s) => ({ ...s })) };
    case "faq":
      return {
        kind,
        id: blockId,
        title: "Vanliga frågor",
        items: [{ question: "Hur lång är leveranstiden?", answer: "Skyltarna graveras och skickas inom fem arbetsdagar." }],
      };
    case "banner":
      return { kind, id: blockId, text: "Mängdrabatt från 10 skyltar", href: "", until: "" };
    case "contact":
      return { kind, id: blockId, title: "Kontakta oss", text: "Har du frågor om skyltar eller större beställningar? Hör av dig." };
  }
}

/** "Om oss" → "om-oss", ledig och tillåten bland butikens sidor. */
export function pathFor(label: string, taken: readonly string[]): string {
  const base =
    label
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 36)
      .replace(/-+$/, "") || "sida";
  const safe = RESERVED_PATHS.has(base) ? `${base}-sida` : base;
  let path = safe;
  for (let n = 2; taken.includes(path); n++) path = `${safe}-${n}`;
  return path;
}

export function newPage(label: string, taken: readonly string[]): ShopPage {
  const name = label.trim().slice(0, 30) || "Ny sida";
  return { id: newId("p"), path: pathFor(name, taken), label: name, blocks: [newBlock("header", name), newBlock("text")] };
}

/** Startsidan som den är i alla butiker. */
export function startPage(): ShopPage {
  const start = defaultContent().pages[0];
  if (!start) throw new Error("Standardsidan saknar startsida");
  return start;
}

/** Startsidan går inte att ändra — vad som än sparats eller föreslagits blir den vanliga. */
export function lockStartPage(content: ShopContent): ShopContent {
  return { ...content, pages: [startPage(), ...content.pages.slice(1)] };
}

/** Sparat innehåll, eller standardsidan när inget finns eller det inte längre håller. */
export function contentOrDefault(value: unknown): ShopContent {
  const parsed = shopContentSchema.safeParse(value);
  return parsed.success ? lockStartPage(parsed.data) : defaultContent();
}

export function findPage(content: ShopContent, path: string): ShopPage | null {
  return content.pages.find((p) => p.path === path) ?? null;
}

/** Alla bilder butiken använder. */
export function imagesIn(content: ShopContent): string[] {
  return [
    ...new Set(
      content.pages.flatMap((page) =>
        page.blocks.flatMap((b) =>
          b.kind === "gallery" ? b.images : (b.kind === "imageText" || b.kind === "header") && b.imageId ? [b.imageId] : [],
        ),
      ),
    ),
  ];
}

/** En kampanjremsa vars sista dag passerat visas inte. */
export function isBannerActive(block: BlockOf<"banner">, today: string): boolean {
  return block.until === "" || block.until >= today;
}
