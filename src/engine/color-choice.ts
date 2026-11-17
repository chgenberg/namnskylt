import type { ColorCombo } from "./catalog";
import { printColorHex } from "./color-code";

/**
 * Färgvalet i två steg. En tvålagersplast har en färg på framsidan och en i
 * kärnan, som gravyren frilägger. Kunden väljer framsidans färg, och kärnans
 * färg bara där samma framsida finns med flera kärnor (vit med svart, blå
 * eller röd). Skylten bär fortfarande kombinationens id, så inget annat i
 * motorn behöver känna till stegen.
 */

/** Framsidans och kärnans namn ur kombinationens namn, `Vit / Svart`. Ett material med en enda färg har ingen kärna. */
export function colorNames(combo: Pick<ColorCombo, "name">): { front: string; core: string | null } {
  const [front, core] = combo.name.split(" / ").map((part) => part.trim());
  return { front: front || combo.name, core: core || null };
}

export interface FrontChoice {
  /** Framsidans namn, `Vit`. */
  name: string;
  /** Kombinationen som väljs med den här framsidan. */
  combo: ColorCombo;
  selected: boolean;
}

export interface CoreChoice {
  /** Kärnans namn, `Svart`. */
  name: string;
  combo: ColorCombo;
  selected: boolean;
}

export interface ColorChoices {
  /** En per framsida, i listans ordning. */
  fronts: FrontChoice[];
  /** Kärnorna som den valda framsidan finns med. Tom när det bara finns en. */
  cores: CoreChoice[];
}

/**
 * Valen för en lista av kombinationer och den som är vald. Byter kunden
 * framsida behålls kärnans färg om den nya framsidan finns med den, annars
 * gäller framsidans första kombination.
 */
export function colorChoices(colors: readonly ColorCombo[], selectedId: string): ColorChoices {
  const selected = colors.find((combo) => combo.id === selectedId) ?? null;
  const bySurface = new Map<string, ColorCombo[]>();
  for (const combo of colors) {
    const group = bySurface.get(combo.surface);
    if (group) group.push(combo);
    else bySurface.set(combo.surface, [combo]);
  }
  const fronts = [...bySurface.values()].map((group): FrontChoice => {
    const first = group[0] as ColorCombo;
    const isSelected = selected !== null && group.includes(selected);
    const combo = isSelected ? selected : (group.find((c) => c.engraving === selected?.engraving) ?? first);
    return { name: colorNames(combo).front, combo, selected: isSelected };
  });
  const group = selected ? (bySurface.get(selected.surface) ?? []) : [];
  const cores = group.length > 1 ? group.map((combo): CoreChoice => ({ name: colorNames(combo).core ?? combo.name, combo, selected: combo === selected })) : [];
  return { fronts, cores };
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
