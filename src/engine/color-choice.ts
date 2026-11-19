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

/** En färg att välja för trycket: namnet kunden ser, och skärmfärgen som sparas. */
export interface PrintColor {
  name: string;
  hex: string;
}

/**
 * Färgerna att välja bland för trycket (beslut av ägaren 2026-11-19: "14 plus våra färger").
 * Det är verkstadens namngivna färger: gravyrplastens fjorton framsidor, med samma namn och
 * skärmfärg. De sju första på varje rad är inte ordnade efter katalogen utan efter hur de
 * visas: neutrala först, sedan färgerna från gult till blått. Sju av dem är verkstadens egna
 * standardfärger för tryck (`PRINT_STANDARD_COLORS`). Testet i `print-color.test.ts` vaktar
 * att listan är just plastens framsidor.
 *
 * Guld och silver är här platta tryckfärger, inte metall.
 */
export const PRINT_PALETTE: readonly PrintColor[] = [
  { name: "Svart", hex: "#111111" },
  { name: "Vit", hex: "#FFFFFF" },
  { name: "Grå", hex: "#7A828C" },
  { name: "Silver", hex: "#C5CDD4" },
  { name: "Guld", hex: "#D4A017" },
  { name: "Gul", hex: "#FFD200" },
  { name: "Orange", hex: "#FF6A00" },
  { name: "Röd", hex: "#E31C23" },
  { name: "Brun", hex: "#8A4020" },
  { name: "Mörkbrun", hex: "#4A2412" },
  { name: "Grön", hex: "#00A33A" },
  { name: "Mörkgrön", hex: "#006B2E" },
  { name: "Blå", hex: "#0057B8" },
  { name: "Mörkblå", hex: "#003366" },
];

/** Palettens namn på en färg, eller `null` när färgen är kundens egen. */
export function printColorName(hex: string | null | undefined): string | null {
  const wanted = hex?.toUpperCase();
  return PRINT_PALETTE.find((color) => color.hex === wanted)?.name ?? null;
}

/** Ljusheten i en skärmfärg, 0 (svart) till 1 (vitt), som den räknas för kontrast. */
function relativeLuminance(hex: string): number {
  const value = parseInt((printColorHex(hex) ?? "#000000").slice(1), 16);
  const channel = (byte: number) => {
    const share = byte / 255;
    return share <= 0.03928 ? share / 12.92 : ((share + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel((value >> 16) & 255) + 0.7152 * channel((value >> 8) & 255) + 0.0722 * channel(value & 255);
}

/**
 * Kontrasten mellan två skärmfärger, från 1 (samma ljushet) till 21 (svart mot vitt). Samma
 * mått som i tillgänglighetsreglerna för text.
 */
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

/** Under den här kontrasten mot skyltens yta syns texten i praktiken inte: vitt på vit lack. */
export const INVISIBLE_CONTRAST = 1.3;
/** Under den här kontrasten är texten svår att läsa, och färgvalet varnar. */
export const LOW_CONTRAST = 2;
/** Från den här kontrasten passar en färg som textfärg på ytan. */
const GOOD_CONTRAST = 3;

/**
 * Färgen som passar bäst som textfärg på skyltens yta, bland loggans färger. Färgerna kommer
 * i ordning efter hur mycket av loggan de täcker, och den första som syns bra mot ytan väljs:
 * loggans huvudfärg när den går att läsa, annars nästa. Syns ingen bra väljs den som syns
 * bäst, om den alls går att läsa. Annars `null`: då passar ingen av loggans färger.
 */
export function bestTextColor(colors: readonly string[], surface: string): string | null {
  const good = colors.find((color) => contrastRatio(color, surface) >= GOOD_CONTRAST);
  if (good) return good;
  const clearest = [...colors].sort((a, b) => contrastRatio(b, surface) - contrastRatio(a, surface))[0];
  return clearest && contrastRatio(clearest, surface) >= LOW_CONTRAST ? clearest : null;
}

