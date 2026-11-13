import { verifyLinkToken } from "./link-token";
import type { MaterialId } from "@/engine";

/** Landningssidans rena regler: vilka besök som räknas och vilken länk som gäller. */

/** Länkskannrar, förhandsvisningar och skript — de är inte mottagaren. */
const BOT_UA =
  /bot|crawl|spider|slurp|preview|facebookexternalhit|proofpoint|mimecast|barracuda|safelinks|python|curl|wget|headless|scanner|monitor/i;

/** Ett besök räknas som landning bara om det är en människa och inte vi själva. */
export function recordLandingDecision(userAgent: string | null, isOwnerSession: boolean): boolean {
  if (isOwnerSession) return false;
  if (!userAgent || userAgent.trim().length < 10) return false;
  return !BOT_UA.test(userAgent);
}

/** Ogiltig, utgången och fel sorts länk ger samma svar, så att ingen kan pröva sig fram. */
export function landingMessageId(token: string, secrets: readonly (string | undefined)[], now: Date): string | null {
  const verified = verifyLinkToken(token, "landing", secrets, now);
  return verified.ok ? verified.messageId : null;
}

/** Materialet i `?m=` om det är ett av rutorna i mejlet. */
export function chosenMaterial(value: string | undefined, offered: readonly MaterialId[]): MaterialId | null {
  return offered.find((id) => id === value) ?? null;
}

/**
 * Rutan som visas: `?f=` från sidans egna rutor, annars `?m=` och `?c=` från
 * mejlet. `null` = hjältebilden.
 */
export function selectedTile<T extends { id: string; materialId: string; colorId: string }>(
  tiles: readonly T[],
  query: { f?: string; m?: string; c?: string },
): T | null {
  const byId = query.f ? tiles.find((t) => t.id === query.f) : undefined;
  if (byId) return byId;
  const material = chosenMaterial(query.m, tiles.map((t) => t.materialId as MaterialId));
  if (!material) return null;
  return tiles.find((t) => t.materialId === material && t.colorId === query.c) ?? tiles.find((t) => t.materialId === material) ?? null;
}
