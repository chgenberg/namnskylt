import { TEXT_LIMITS } from "./catalog";
import type { BadgeDocument, BadgeTextRow, Mm } from "./types";

/** Versalhöjd per rad i ett nytt dokument: namn stort, titel mindre. */
const DEFAULT_ROW_CAP_MM: readonly Mm[] = [6, 3.4, 2.8];

/**
 * Delar den smarta rutans text i rader. "Anna Lindqvist, Projektledare" och
 * "Anna Lindqvist | Projektledare" blir två rader. Bindestreck inne i ett ord
 * ("Lars-Erik") delar inte — bara streck med mellanslag runt.
 */
export function parseSmartInput(raw: string): string[] {
  return raw
    .split(/\n|\||,|\s[-–—]\s/)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter((part) => part.length > 0)
    .slice(0, TEXT_LIMITS.maxRows)
    .map((part) => part.slice(0, TEXT_LIMITS.maxChars));
}

/** Id:t måste vara deterministiskt — dokumentet skapas både på servern och i klienten. */
export function createRow(index: number, text = "", id = `row-${index}`): BadgeTextRow {
  return {
    id,
    text,
    capHeightMm: DEFAULT_ROW_CAP_MM[index] ?? DEFAULT_ROW_CAP_MM.at(-1)!,
    bold: index === 0,
  };
}

export function createBadgeDocument(texts: readonly string[] = []): BadgeDocument {
  const rows = (texts.length > 0 ? texts : [""]).map((text, i) => createRow(i, text));
  return {
    version: 1,
    materialId: "plastic-2-layer",
    colorId: "white-black",
    shape: "rounded",
    size: { widthMm: 70, heightMm: 25 },
    cornerRadiusMm: 3,
    frame: { style: "none", insetMm: 1.5, thicknessMm: 0.4 },
    font: "arial",
    align: "center",
    rows,
    mounting: "pin",
    quantity: 1,
  };
}

/** Text som faktiskt graveras — tomma rader kostar inget och ritas inte. */
export function engravedRows(doc: BadgeDocument): BadgeTextRow[] {
  return doc.rows.filter((row) => row.text.trim().length > 0);
}
