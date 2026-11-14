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

/** Antal skyltar i gruppen, alla namn gånger antalet per namn. */
export function groupQuantity(group: BadgeGroup): number {
  return groupBadges(group).reduce((total, badge) => total + Math.max(1, Math.floor(badge.quantity)), 0);
}
