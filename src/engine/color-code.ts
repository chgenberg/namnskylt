/**
 * Färgkoderna kunden skriver för trycket (besked via ägaren 2026-11-17: det är
 * CMYK som trycket görs i). Fältet är fritext och tar CMYK, PMS och hex. Två
 * slags koder går att rita på skylten: CMYK och hex. PMS, RAL och annat följer
 * bara med ordern, eftersom vi inte har deras färger.
 */

/** En CMYK-kod: andelen av varje tryckfärg i procent, 0–100. */
export interface Cmyk {
  c: number;
  m: number;
  y: number;
  k: number;
}

/** Ett tal i procent, med valfritt procenttecken efter. `decimal` är tecknen som får vara decimaltecken. */
const percent = (decimal: string) => String.raw`(\d{1,3}(?:[${decimal}]\d+)?)\s*%?`;
/** Fyra värden med samma skiljetecken hela vägen. */
const four = (number: string, between: string) => new RegExp(`^${[number, number, number, number].join(between)}$`);
/**
 * Den korta formen: `100/60/0/20`, `100, 60, 0, 20` eller `100 60 0 20`.
 * Skiljetecknet ska vara detsamma mellan alla fyra värden. Annars kunde tre
 * värden med decimalkomma (`0,5/10/20`) läsas som fyra, och kunden få en kod
 * den aldrig skrev. Kommat är decimaltecken överallt utom där det skiljer värdena åt.
 */
const BARE = [
  ...["/", ";", String.raw`\|`, "-"].map((separator) => four(percent(".,"), String.raw`\s*${separator}\s*`)),
  four(percent("."), String.raw`\s*,\s*`),
  four(percent(".,"), String.raw`\s+`),
];
/** `C100 M60 Y0 K20`, även `C: 100, M: 60 …` och `C=100 M=60 …`. */
const LETTERED = new RegExp(
  `^${["c", "m", "y", "k"].map((letter) => String.raw`${letter}\s*[:=]?\s*${percent(".,")}`).join(String.raw`[\s,;/|-]*`)}$`,
  "i",
);

/**
 * CMYK-värdena i en färgkod, eller `null` när koden är något annat. Fyra tal
 * mellan 0 och 100 räcker; ordet CMYK och bokstäverna får stå med men behövs
 * inte. Ett PMS-nummer är ett enda tal och läses därför aldrig som CMYK.
 */
export function cmykOf(code: string | null | undefined): Cmyk | null {
  const text = (code ?? "")
    .trim()
    .replace(/^cmyk\s*[:=]?\s*/i, "")
    .replace(/^\((.*)\)$/, "$1")
    .trim();
  const match = LETTERED.exec(text) ?? BARE.map((pattern) => pattern.exec(text)).find(Boolean);
  if (!match) return null;
  const [c, m, y, k] = match.slice(1, 5).map((value) => Number(value.replace(",", "."))) as [number, number, number, number];
  return [c, m, y, k].every((value) => value <= 100) ? { c, m, y, k } : null;
}

/** `CMYK 100/60/0/20`: så står en CMYK-kod i listor och i verkstadens underlag, hur kunden än skrev den. */
export function cmykText({ c, m, y, k }: Cmyk): string {
  return `CMYK ${c}/${m}/${y}/${k}`;
}

/**
 * Skärmens färg för en CMYK-kod, som `#RRGGBB`. Omräkningen är den enkla, utan
 * tryckeriets profil, så färgen är ungefärlig: mättade färger ser klarare ut på
 * skärmen än i trycket. CMYK-koden är det som gäller för tillverkningen.
 */
export function cmykHex({ c, m, y, k }: Cmyk): string {
  const channel = (ink: number) =>
    Math.round(255 * (1 - ink / 100) * (1 - k / 100))
      .toString(16)
      .padStart(2, "0");
  return `#${channel(c)}${channel(m)}${channel(y)}`.toUpperCase();
}

/** Hexkoden i en färgkod, som `#RRGGBB` i versaler. Tre siffror kräver brädgården: `286` är ett PMS-nummer och ingen färg. */
function hexOf(code: string | null | undefined): string | null {
  const text = code?.trim() ?? "";
  const long = /^#?([0-9a-f]{6})$/i.exec(text);
  if (long) return `#${long[1]!.toUpperCase()}`;
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(text);
  return short ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toUpperCase() : null;
}

/**
 * Färgen en färgkod ritas i på skärmen, som `#RRGGBB` i versaler: hexkoden
 * själv, eller CMYK-koden omräknad. `null` för koder som inte går att rita,
 * som PMS och RAL.
 */
export function printColorHex(code: string | null | undefined): string | null {
  const hex = hexOf(code);
  if (hex) return hex;
  const cmyk = cmykOf(code);
  return cmyk ? cmykHex(cmyk) : null;
}

/**
 * Koden som den står i listor och underlag: en CMYK-kod som `CMYK 100/60/0/20`
 * och en hexkod som `#RRGGBB`, så att verkstaden läser samma sak hur kunden än
 * skrev. Allt annat står som kunden skrev det.
 */
export function printColorText(code: string): string {
  const cmyk = cmykOf(code);
  return cmyk ? cmykText(cmyk) : (hexOf(code) ?? code.trim());
}
