import { MAX_ORDER_BADGES, parseBatchInput, withTexts, type BadgeDocument } from "@/engine";

/** Samma skyltar igen. Antalet per namn behålls; kunden ändrar i efterhand om det behövs. */
export function repeatBadges(badges: readonly BadgeDocument[]): BadgeDocument[] {
  return badges.map((badge) => structuredClone(badge));
}

/**
 * Samma design till ny personal: en skylt per rad i `names`, med samma syntax
 * som designerns "Fler namn". Mallen är orderns första skylt.
 */
export function staffBadges(template: BadgeDocument, names: string, quantity = 1): BadgeDocument[] {
  return parseBatchInput(names, MAX_ORDER_BADGES).map((texts) => ({
    ...withTexts(template, texts),
    quantity: Math.max(1, Math.floor(quantity)),
  }));
}
