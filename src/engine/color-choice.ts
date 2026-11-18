import type { ColorCombo } from "./catalog";
import { printColorHex } from "./color-code";

/**
 * Färgvalet. En tvålagersplast har en färg på framsidan och en i kärnan, som gravyren
 * frilägger, och varje kombination är ett eget val: en prick som visar båda färgerna
 * (beslut av ägaren 2026-11-18: det man ser är det man kan välja). Förut valdes framsidan
 * först och kärnans färg på en egen rad, "Gravyrens färg", som togs för något som gällde
 * produktionen.
 */

/** Framsidans och kärnans namn ur kombinationens namn, `Vit / Svart`. Ett material med en enda färg har ingen kärna. */
export function colorNames(combo: Pick<ColorCombo, "name">): { front: string; core: string | null } {
  const [front, core] = combo.name.split(" / ").map((part) => part.trim());
  return { front: front || combo.name, core: core || null };
}

/**
 * Kombinationerna i den ordning de visas: listans ordning, med samma framsida intill varandra,
 * så att vit med svart, blå och röd kärna står bredvid varandra.
 */
export function byFront<T extends Pick<ColorCombo, "surface">>(colors: readonly T[]): T[] {
  const order = new Map<string, number>();
  for (const combo of colors) if (!order.has(combo.surface)) order.set(combo.surface, order.size);
  // Stabil sortering: inom en framsida gäller listans ordning.
  return [...colors].sort((a, b) => (order.get(a.surface) ?? 0) - (order.get(b.surface) ?? 0));
}

/**
 * Gravyrens färg som `#RRGGBB`: färgen ett tryck utan egen kod visas i, och
 * den som skickas till verkstaden när kunden inte har angett någon.
 */
export function engravingHex(combo: Pick<ColorCombo, "engraving">): string {
  return printColorHex(combo.engraving) ?? "#000000";
}

/** Koderna för en färg: skärmens hex, och PMS och RAL när verkstaden har lämnat dem. */
export interface PigmentCodes {
  hex: string;
  pms?: string;
  ral?: string;
}

/**
 * PMS och RAL per pigment, med pigmentets hex i versaler som nyckel. Varken
 * vår katalog eller verkstadens har de koderna än (2026-11-16): listan fylls i
 * när verkstaden har lämnat dem, och då visas de av sig själva i färgväljaren.
 * Hitta aldrig på en kod här. Hex är skärmens färg ur verkstadens katalog och
 * ungefärlig mot den fysiska skivan.
 */
const PIGMENT_CODES: Readonly<Record<string, Omit<PigmentCodes, "hex">>> = {};

export function pigmentCodes(hex: string): PigmentCodes {
  const key = hex.toUpperCase();
  return { hex: key, ...PIGMENT_CODES[key] };
}

/** Koderna så som de visas: `PMS 286 C · RAL 5005 · #0057B8`, med hex sist. */
export function pigmentCodeText(hex: string): string {
  const { pms, ral, hex: shown } = pigmentCodes(hex);
  return [pms && `PMS ${pms}`, ral && `RAL ${ral}`, shown].filter(Boolean).join(" · ");
}
