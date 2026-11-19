import { createRow, parseSmartInput } from "./document";
import type { BadgeDocument } from "./types";

/** Så många skyltar (orderrader) en order får innehålla — samma gräns i API:t. */
export const MAX_ORDER_BADGES = 100;

/**
 * En skylt per rad, med samma syntax som startsidans ruta: "Anna Lindqvist,
 * Projektledare". Tabbar räknas som radbrytning inom skylten så att två
 * kolumner inklistrade från Excel blir namn + titel.
 */
export function parseBatchInput(raw: string, max = MAX_ORDER_BADGES): string[][] {
  return raw
    .split(/\r?\n/)
    .map(parseBatchLine)
    .filter((texts) => texts.length > 0)
    .slice(0, max);
}

function parseBatchLine(line: string): string[] {
  return parseSmartInput(line.replace(/\t/g, "|"));
}

/**
 * Antalet per namn när namnlistan under "Fler namn" ändras från `before` till `after`.
 * När listan får sina första namn blir antalet 1 (besked via ägaren 2026-11-18): antalet
 * kunden hade valt gällde en ensam skylt, och med en lista gäller det varje namn, så att
 * 10 skyltar och 10 uppladdade namn blev 100 skyltar. Därefter är antalet kundens eget
 * val per namn och ändras inte av att fler namn läggs till.
 */
export function quantityForNames(quantity: number, before: string, after: string): number {
  const starts = parseBatchInput(before, 1).length === 0 && parseBatchInput(after, 1).length > 0;
  return starts ? 1 : quantity;
}

/** Tar bort skylt nummer `index` (som `parseBatchInput` räknar) ur texten. */
export function removeBatchEntry(raw: string, index: number): string {
  let entry = -1;
  return raw
    .split(/\r?\n/)
    .filter((line) => parseBatchLine(line).length === 0 || ++entry !== index)
    .join("\n");
}

/** Byter texten för skylt nummer `index` mot `line` — tomrader och ordning lämnas orörda. */
export function replaceBatchEntry(raw: string, index: number, line: string): string {
  let entry = -1;
  return raw
    .split(/\r?\n/)
    .map((current) => (parseBatchLine(current).length > 0 && ++entry === index ? line : current))
    .join("\n");
}

/**
 * Samma design med nya texter. Rad i ärver stil (versalhöjd, fetstil) från
 * mallens rad i; rader mallen saknar får standardstil.
 */
export function withTexts(template: BadgeDocument, texts: readonly string[]): BadgeDocument {
  const rows = (texts.length > 0 ? texts : [""]).map((text, i) => {
    const base = template.rows[i] ?? createRow(i);
    return { ...base, id: `row-${i}`, text };
  });
  return { ...template, rows };
}

/** Rad i textrutan för ett dokument — inversen av `parseBatchInput` för en rad. */
export function batchLine(doc: BadgeDocument): string {
  return doc.rows
    .map((row) => row.text.trim())
    .filter((text) => text.length > 0)
    .join(", ");
}

/**
 * En design med sina namn: skylten som den står i editorn och raderna i
 * textrutan "Fler namn". En order kan innehålla flera sådana, till exempel en
 * metallskylt till ledningen och plastskyltar till personalen.
 */
export interface BadgeGroup {
  doc: BadgeDocument;
  batchText: string;
}

/** Gruppens skyltar: dokumentet först, sedan en skylt per rad i textrutan, högst `max` stycken. */
export function groupBadges(group: BadgeGroup, max = MAX_ORDER_BADGES): BadgeDocument[] {
  if (max <= 0) return [];
  return [group.doc, ...parseBatchInput(group.batchText, max - 1).map((texts) => withTexts(group.doc, texts))];
}

/**
 * Gruppen som den ska beställas. Saknar skylten text och listan har namn tar listans första
 * namn skyltens plats: listan är namnen kunden vill ha, och en skylt utan text först i den
 * är ingen beställning. En skylt med bara logga går att beställa för sig (beslut av ägaren
 * 2026-11-18), men då utan namn i listan.
 */
export function withLeadName(group: BadgeGroup): BadgeGroup {
  if (group.doc.rows.some((row) => row.text.trim().length > 0)) return group;
  const [first] = parseBatchInput(group.batchText, 1);
  return first ? { doc: withTexts(group.doc, first), batchText: removeBatchEntry(group.batchText, 0) } : group;
}

/** Antal skyltar i gruppen, alla namn gånger antalet per namn. */
export function groupQuantity(group: BadgeGroup): number {
  return groupBadges(group).reduce((total, badge) => total + Math.max(1, Math.floor(badge.quantity)), 0);
}

/** Skylten utan radernas id: två skyltar som bara skiljer där är samma skylt. */
function withoutRowIds(doc: BadgeDocument): string {
  return JSON.stringify({ ...doc, rows: doc.rows.map((row) => ({ ...row, id: "" })) });
}

/**
 * Sant när `badge` är precis den skylt som `template` ger med badgens text på
 * en rad i textrutan "Fler namn". Då kan den stå som ett namn i mallens grupp.
 */
function fitsAsBatchLine(template: BadgeDocument, badge: BadgeDocument): boolean {
  const entries = parseBatchInput(batchLine(badge), 2);
  const texts = entries[0];
  if (entries.length !== 1 || !texts) return false;
  return withoutRowIds(withTexts(template, texts)) === withoutRowIds(badge);
}

/**
 * En orders skyltar tillbaka som designer med sina namn, inversen av
 * `groupBadges`: skyltar i följd som bara skiljer i namn blir en grupp, med
 * den första som mall och de andra som rader i textrutan. En skylt som inte
 * går att skriva som en rad (en annan design, ett annat antal, egen stil på
 * en rad eller en text med skiljetecken) börjar en ny grupp. Grupperna ger
 * alltid tillbaka exakt samma skyltar.
 */
export function badgeGroups(badges: readonly BadgeDocument[]): BadgeGroup[] {
  const groups: BadgeGroup[] = [];
  for (const badge of badges) {
    const current = groups.at(-1);
    if (current && fitsAsBatchLine(current.doc, badge)) {
      const line = batchLine(badge);
      current.batchText = current.batchText ? `${current.batchText}\n${line}` : line;
    } else {
      groups.push({ doc: badge, batchText: "" });
    }
  }
  return groups;
}

/** Skyltens design utan texter och antal: det som avgör hur den ser ut och tillverkas. */
function designKey(doc: BadgeDocument): string {
  const design: Partial<BadgeDocument> = { ...doc };
  delete design.rows;
  delete design.quantity;
  // Hänvisningen till loggans originalfil ändrar inte hur skylten ser ut.
  if (design.logo?.originalId) {
    const logo = { ...design.logo };
    delete logo.originalId;
    design.logo = logo;
  }
  return JSON.stringify(design);
}

/**
 * Sant när alla skyltar har samma design och bara namnen skiljer. En bild av
 * den första skylten visar då hur alla ser ut; i en order med flera designer
 * gör den inte det.
 */
export function sameDesign(badges: readonly BadgeDocument[]): boolean {
  const first = badges[0];
  if (!first) return true;
  const key = designKey(first);
  return badges.every((badge) => designKey(badge) === key);
}

/** En design i en order: en skylt som visar den, och hur många skyltar som har den. */
export interface OrderDesign {
  doc: BadgeDocument;
  count: number;
}

/**
 * Orderns designer i den ordning de står, var och en med sitt antal skyltar. Skyltar med
 * samma design och olika namn räknas ihop. En order med metallskyltar och plastskyltar har
 * alltså två: den som läser ordern ska se båda, inte bara den första.
 */
export function orderDesigns(badges: readonly BadgeDocument[]): OrderDesign[] {
  const designs: (OrderDesign & { key: string })[] = [];
  for (const badge of badges) {
    const key = designKey(badge);
    const same = designs.find((design) => design.key === key);
    if (same) same.count += badge.quantity;
    else designs.push({ doc: badge, count: badge.quantity, key });
  }
  return designs.map(({ doc, count }) => ({ doc, count }));
}
