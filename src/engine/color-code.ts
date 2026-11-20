/**
 * Färgen på trycket är en skärmfärg, som hos Skylt & Gravyrteknik (beslut av
 * ägaren 2026-11-18): kunden väljer en av standardfärgerna eller en egen färg,
 * och den sparas som `#RRGGBB`. Verkstadens tryckfil ritas i den färgen, och
 * printerns programvara räknar om den till tryckfärger. Ingen läser en kod och
 * ställer in färgen för hand.
 *
 * Från 2026-11-17 till 2026-11-18 var fältet fritext och tog CMYK, PMS och hex.
 * Samma CMYK ger olika färg i olika printrar, och koderna följde bara med
 * ordern som text som någon fick läsa. Reglerna för de koderna står kvar här,
 * eftersom en äldre skylt kan bära dem: de läses och ritas som förut, och blir
 * en skärmfärg när skylten öppnas i skyltmotorn (`withScreenPrintColors`).
 */

/**
 * Standardfärgerna för tryck, verkstadens egna (deras `PRINT_STANDARD_RGB`):
 * samma id, namn och färg. `src/lib/supplier/catalog-sync.test.ts` jämför
 * listan med deras katalog när deras projekt ligger bredvid på datorn.
 */
export const PRINT_STANDARD_COLORS = [
  { id: "white", name: "Vit", hex: "#FFFFFF" },
  { id: "black", name: "Svart", hex: "#111111" },
  { id: "yellow", name: "Varningsgul", hex: "#FFD200" },
  { id: "red", name: "Röd", hex: "#E31C23" },
  { id: "blue", name: "Blå", hex: "#0057B8" },
  { id: "green", name: "Grön", hex: "#00A33A" },
  { id: "orange", name: "Orange", hex: "#FF6A00" },
] as const;

/**
 * En färg för trycket som den sparas, `#RRGGBB` i versaler, ur det kunden
 * väljer eller skriver: sex siffror, med eller utan brädgård. `null` för allt
 * annat. Det är verkstadens egen regel för färger i deras format.
 */
export function printHex(input: string | null | undefined): string | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(input?.trim() ?? "");
  return match ? `#${match[1]!.toUpperCase()}` : null;
}

/** Sant när värdet redan är en sparad skärmfärg: `#RRGGBB`. */
export function isPrintHex(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value);
}

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

/**
 * Tryckfärgerna för en skärmfärg, i hela procent: den enkla omräkningen, omvändningen av `cmykHex`.
 * Verkstadens tryckfil bär de här värdena (besked från Mats via ägaren 2026-11-20: tryckfilen ska
 * vara i CMYK), och kunden ser samma värden vid färgvalet. Svart text blir ren svart (bara K),
 * aldrig en blandning av alla fyra. `null` när koden inte är en skärmfärg.
 */
export function hexCmyk(hex: string): Cmyk | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const value = parseInt(match[1]!, 16);
  const [r, g, b] = [(value >> 16) & 255, (value >> 8) & 255, value & 255].map((channel) => channel / 255) as [number, number, number];
  const black = 1 - Math.max(r, g, b);
  if (black >= 1) return { c: 0, m: 0, y: 0, k: 100 };
  const ink = (channel: number) => Math.round(((1 - channel - black) / (1 - black)) * 100);
  return { c: ink(r), m: ink(g), y: ink(b), k: Math.round(black * 100) };
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
