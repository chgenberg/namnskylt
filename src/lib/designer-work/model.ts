import { z } from "zod";
import {
  MAX_ORDER_BADGES,
  badgeDocumentSchema,
  groupBadges,
  isOfferedDocument,
  type BadgeDocument,
  type BadgeGroup,
} from "@/engine";
import { SAVED_WORK_VERSION } from "./key";

export { SAVED_WORK_VERSION, savedWorkKey, type WorkScope } from "./key";

/**
 * Skyltmotorns arbete som det sparas i webbläsaren: designen i editorn,
 * namnlistan, varukorgen och om skylten i editorn är ny och orörd. Sparas i
 * `localStorage`, så att en omladdad sida inte tömmer varukorgen.
 */
export interface SavedWork {
  doc: BadgeDocument;
  batchText: string;
  cart: BadgeGroup[];
  pending: boolean;
  /**
   * Vad skyltmotorn öppnades med (`openedWith`): texten eller skylten i
   * adressen, tom utan något. Samma värde igen betyder att sidan har laddats
   * om, och då ska arbetet komma tillbaka som det var.
   */
  opened: string;
}

/** Äldre än så här kastas det sparade: priser och sortiment kan ha ändrats. */
export const SAVED_WORK_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
/** Namnlistan är fri text; mer än så här är inte en namnlista. */
const MAX_BATCH_CHARS = 20_000;
const MAX_OPENED_CHARS = 600;

/** Sant när skylten har något kunden har gjort: en text eller en logga. */
function hasContent(doc: BadgeDocument, batchText: string): boolean {
  return Boolean(doc.logo) || batchText.trim() !== "" || doc.rows.some((row) => row.text.trim() !== "");
}

/** Sant när det finns något att spara. En tom skylt utan varukorg sparas inte, så att inget gammalt ligger kvar. */
export function isWorthSaving(work: SavedWork): boolean {
  return work.cart.length > 0 || hasContent(work.doc, work.batchText);
}

/**
 * Skylten ur något okänt, eller `null` när den inte håller måttet. En skylt
 * utan text går inte att beställa, men den får ligga i editorn och i
 * varukorgen: då kontrolleras resten av skylten med en platshållare som text.
 */
function parseWorkDoc(raw: unknown): BadgeDocument | null {
  const parsed = badgeDocumentSchema.safeParse(raw);
  if (parsed.success) return parsed.data as BadgeDocument;
  if (!raw || typeof raw !== "object") return null;
  const rows: unknown = (raw as { rows?: unknown }).rows;
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const blank = rows.every((row: unknown) => {
    const text = row && typeof row === "object" ? (row as { text?: unknown }).text : null;
    return typeof text === "string" && text.trim() === "";
  });
  if (!blank) return null;
  const first = rows[0] as { text: string };
  const filled = badgeDocumentSchema.safeParse({ ...raw, rows: rows.map((row: unknown, i) => (i === 0 ? { ...first, text: "x" } : row)) });
  if (!filled.success) return null;
  const doc = filled.data as BadgeDocument;
  return { ...doc, rows: doc.rows.map((row, i) => (i === 0 ? { ...row, text: first.text } : row)) };
}

/**
 * Sant när allt i arbetet går att läsa tillbaka. Mitt i en ändring kan skylten
 * vara ogiltig, till exempel en egen form som korsar sig själv. Då sparas
 * inget nytt, och det som sparades senast ligger kvar.
 */
export function isSaveable(work: SavedWork): boolean {
  return [work.doc, ...work.cart.map((group) => group.doc)].every((doc) => {
    const parsed = parseWorkDoc(doc);
    return parsed !== null && isOfferedDocument(parsed);
  });
}

/** En skylt så som den sparas: loggan ligger i en gemensam lista, eftersom designerna i en varukorg oftast delar logga. */
const packedDocSchema = z.object({ doc: z.unknown(), logo: z.number().int().min(0).optional() });

const envelopeSchema = z.object({
  v: z.literal(SAVED_WORK_VERSION),
  /** När arbetet sparades, i millisekunder. */
  at: z.number(),
  logos: z.array(z.unknown()).max(MAX_ORDER_BADGES + 1),
  editor: packedDocSchema,
  batchText: z.string().max(MAX_BATCH_CHARS),
  cart: z.array(packedDocSchema.extend({ batchText: z.string().max(MAX_BATCH_CHARS) })).max(MAX_ORDER_BADGES),
  pending: z.boolean(),
  opened: z.string().max(MAX_OPENED_CHARS),
});

/**
 * Arbetet som text att lägga i `localStorage`. Samma logga sparas en gång, hur
 * många designer som än bär den: "Lägg i varukorgen och designa en till"
 * behåller loggan, så utan det skulle varje design upprepa den.
 */
export function packSavedWork(work: SavedWork, nowMs: number): string {
  const logos: string[] = [];
  const pack = (doc: BadgeDocument) => {
    if (!doc.logo) return { doc };
    const json = JSON.stringify(doc.logo);
    let index = logos.indexOf(json);
    if (index < 0) index = logos.push(json) - 1;
    const rest: Partial<BadgeDocument> = { ...doc };
    delete rest.logo;
    return { doc: rest, logo: index };
  };
  const editor = pack(work.doc);
  const cart = work.cart.map((group) => ({ ...pack(group.doc), batchText: group.batchText }));
  return JSON.stringify({
    v: SAVED_WORK_VERSION,
    at: nowMs,
    logos: logos.map((json) => JSON.parse(json) as unknown),
    editor,
    batchText: work.batchText,
    cart,
    pending: work.pending,
    opened: work.opened.slice(0, MAX_OPENED_CHARS),
  });
}

/**
 * Det sparade arbetet, eller `null` när det inte går att lita på: trasigt,
 * äldre än 14 dagar, eller med en skylt som inte går att läsa eller inte säljs
 * längre. Hellre ingenting tillbaka än en halv varukorg, som kunden kunde tro
 * var hela ordern.
 */
export function readSavedWork(raw: string | null | undefined, nowMs: number): SavedWork | null {
  if (!raw) return null;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const envelope = envelopeSchema.safeParse(json);
  if (!envelope.success) return null;
  const saved = envelope.data;
  if (nowMs - saved.at > SAVED_WORK_MAX_AGE_MS) return null;
  const unpack = (packed: z.infer<typeof packedDocSchema>): BadgeDocument | null => {
    if (!packed.doc || typeof packed.doc !== "object") return null;
    const logo = packed.logo === undefined ? undefined : saved.logos[packed.logo];
    if (packed.logo !== undefined && logo === undefined) return null;
    const doc = parseWorkDoc(logo === undefined ? packed.doc : { ...packed.doc, logo });
    return doc && isOfferedDocument(doc) ? doc : null;
  };
  const doc = unpack(saved.editor);
  if (!doc) return null;
  const cart: BadgeGroup[] = [];
  for (const packed of saved.cart) {
    const groupDoc = unpack(packed);
    if (!groupDoc) return null;
    cart.push({ doc: groupDoc, batchText: packed.batchText });
  }
  // En ny och orörd skylt finns bara bredvid en varukorg.
  const work = { doc, batchText: saved.batchText, cart, pending: saved.pending && cart.length > 0, opened: saved.opened };
  return isWorthSaving(work) ? work : null;
}

/**
 * Det som känns igen som samma skylt, även när loggan har gjorts om på vägen:
 * en delad länk kan ha bytt loggans bild mot en hänvisning eller tappat den.
 */
function badgeSignature(doc: BadgeDocument): string {
  return JSON.stringify([
    doc.rows.map((row) => row.text.trim()),
    doc.materialId,
    doc.colorId,
    doc.shape,
    doc.size.widthMm,
    doc.size.heightMm,
    doc.mounting,
    Math.max(1, Math.floor(doc.quantity)),
  ]);
}

const badgeTotal = (groups: readonly BadgeGroup[]) => groups.reduce((sum, group) => sum + groupBadges(group).length, 0);

/**
 * Det skyltmotorn öppnades med, som ett värde att jämföra: skylten i en delad
 * länk, texten från startsidan, eller tomt när adressen inte bär något.
 */
export function openedWith(text: string, doc: BadgeDocument | null | undefined): string {
  if (doc) return `d:${badgeSignature(doc)}`.slice(0, MAX_OPENED_CHARS);
  const trimmed = text.trim();
  return trimmed ? `t:${trimmed}`.slice(0, MAX_OPENED_CHARS) : "";
}

/** Det som ska läsas tillbaka i skyltmotorn, och vad kunden ska få veta om det. */
export interface RestoredWork {
  work: SavedWork;
  /** `cart` = varukorgen kom tillbaka, `badge` = skylten kom tillbaka, `null` = inget som behöver sägas. */
  notice: "cart" | "badge" | null;
  /** `saved` = skylten i editorn är den sparade, `incoming` = den som skyltmotorn öppnades med. */
  editor: "saved" | "incoming";
}

/**
 * Avgör vad som läses tillbaka när skyltmotorn öppnas. `incoming` är skylten
 * som adressen gav (`null` utan något i adressen) och `opened` dess värde
 * enligt `openedWith`.
 *
 * - Öppnad utan något i adressen, eller med samma som förra gången (sidan har
 *   laddats om): allt kommer tillbaka som det var.
 * - Öppnad med en skylt som redan finns i det sparade (till exempel länken
 *   tillbaka från en avbruten kortbetalning): allt kommer tillbaka som det var,
 *   så att skylten inte hamnar två gånger i ordern.
 * - Öppnad med en annan skylt (en ny text från startsidan eller någons delade
 *   länk): den nya skylten gäller i editorn. Fanns en varukorg kommer den
 *   tillbaka, tillsammans med skylten som låg i editorn om den räknades in i
 *   ordern. Fanns ingen varukorg läses inget tillbaka: den som börjar på en ny
 *   skylt ska inte få en gammal inlagd i ordern.
 */
export function restoredWork(saved: SavedWork, incoming: BadgeDocument | null, opened: string): RestoredWork | null {
  const asItWas = (notice: RestoredWork["notice"]): RestoredWork => ({ work: { ...saved, opened }, notice, editor: "saved" });
  const noticeFor = saved.cart.length > 0 ? "cart" : "badge";
  if (!incoming || saved.opened === opened) return asItWas(noticeFor);
  const signature = badgeSignature(incoming);
  const known = [saved.doc, ...saved.cart.flatMap((group) => groupBadges(group))].some((doc) => badgeSignature(doc) === signature);
  if (known) {
    // Samma skylt som i adressen och inget mer: då har inget synligt ändrats.
    const silent = saved.cart.length === 0 && saved.batchText.trim() === "";
    return asItWas(silent ? null : noticeFor);
  }
  if (saved.cart.length === 0) return null;
  const counted = !saved.pending && hasContent(saved.doc, saved.batchText);
  const editorGroup: BadgeGroup = { doc: saved.doc, batchText: saved.batchText };
  // Ordern rymmer MAX_ORDER_BADGES skyltar, med den nya i editorn inräknad.
  const fits = badgeTotal(saved.cart) + groupBadges(editorGroup).length + 1 <= MAX_ORDER_BADGES;
  const cart = counted && fits ? [...saved.cart, editorGroup] : saved.cart;
  return { work: { doc: incoming, batchText: "", cart, pending: false, opened }, notice: "cart", editor: "incoming" };
}
