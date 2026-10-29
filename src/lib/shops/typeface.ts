import type { FontId } from "@/engine";
import { matchFont } from "@/lib/brand/match";

export interface ShopFont {
  family: string | null;
  /** Finns hos Google Fonts och laddas därifrån. */
  google: boolean;
}

/**
 * Kommersiella typsnitt kan inte laddas från deras sajt (licens, CORS). Då
 * används den Google-familj som liknar mest. Mönstren testas mot det städade
 * namnet ("FordAntennaCond-Light" → "Ford Antenna Cond Light"); smala först.
 */
const CONDENSED = /condensed|compressed|narrow|\bcond\b/i;
const SUBSTITUTES: readonly (readonly [RegExp, string])[] = [
  [CONDENSED, "Barlow Condensed"],
  [/futura|apertura|century gothic|avant ?garde|twentieth/i, "Jost"],
  [/frutiger|myriad|segoe|univers|tahoma/i, "Hind"],
  [/\bdin\b|antenna|blauer|interstate|bahnschrift/i, "Barlow"],
  [/circular|walsheim|averta|sofia pro|gellix|neue montreal|euclid/i, "DM Sans"],
  [/gilroy|tt commons|tt norms|axiforma|filson/i, "Plus Jakarta Sans"],
  [/silka|visby|manrope/i, "Manrope"],
  [/gotham|proxima|brandon|museo sans|metropolis/i, "Montserrat"],
  [/avenir|vag rounded|lota/i, "Nunito Sans"],
  [/maison neue|haffer|protipo/i, "Work Sans"],
  [/deja ?vu|verdana/i, "Open Sans"],
  [/helvetica|akzidenz|neue haas|graphik|aktiv grotesk|suisse|sf pro|san francisco|arial|system font|google sans|product sans/i, "Inter"],
  [/franklin/i, "Libre Franklin"],
  [/garamond|minion|sabon|caslon/i, "EB Garamond"],
  [/baskerville|times|georgia|tiempos|freight|publico|chronicle/i, "Libre Baskerville"],
  [/bodoni|didot|butler|canela|domaine/i, "Playfair Display"],
  [/serif|slab/i, "Source Serif 4"],
];

/** Vanliga Google-familjer, så att "Inter var" och "Raleway-Semibold" känns igen. */
const GOOGLE_FAMILIES = [
  "Inter", "Jost", "Mulish", "Poppins", "Raleway", "Archivo", "Archivo Narrow", "Open Sans", "Montserrat", "Roboto",
  "Roboto Condensed", "Lato", "Source Sans Pro", "Source Sans 3", "DM Sans", "Quicksand", "Ubuntu", "Barlow",
  "Barlow Condensed", "Outfit", "Playfair Display", "Bricolage Grotesque", "Nunito", "Nunito Sans", "Work Sans",
  "Manrope", "Rubik", "Karla", "Oswald", "Merriweather", "PT Sans", "Noto Sans", "Figtree", "Plus Jakarta Sans",
  "Libre Franklin", "Lexend", "Urbanist", "Sora", "Space Grotesk", "Josefin Sans", "Cabin", "Fira Sans", "Heebo",
  "Hind", "Mukta", "Assistant", "Titillium Web", "Kanit", "Lora", "EB Garamond", "Cormorant Garamond",
  "Libre Baskerville", "Source Serif 4", "Red Hat Display", "Albert Sans", "Onest", "Instrument Sans",
];
const GOOGLE_BY_KEY = new Map(GOOGLE_FAMILIES.map((family) => [family.toLowerCase(), family]));
const STYLE_WORD = /^(regular|medium|semi ?bold|bold|light|thin|black|book|extra|ultra|heavy|italic|var|vf|flex|webfont|web|font|std|v\d+|w\d+|\d{2,3})$/i;

/** "FordAntennaCond-Light" → "Ford Antenna Cond Light". */
export function tidyFamily(family: string): string {
  return family
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Google-familjen bakom ett namn med vikt- och versionsord, eller `null`. */
export function googleFamilyFor(family: string): string | null {
  const words = tidyFamily(family).split(" ");
  while (words.length > 0) {
    const known = GOOGLE_BY_KEY.get(words.join(" ").toLowerCase());
    if (known) return known;
    const last = words.at(-1) ?? "";
    if (!STYLE_WORD.test(last)) return null;
    words.pop();
  }
  return null;
}

const SANS_FALLBACK = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const SERIF_FALLBACK = 'Georgia, "Times New Roman", serif';
const SERIF_FAMILY = /^(EB Garamond|Libre Baskerville|Playfair Display|Source Serif 4)$/;

export interface ShopTypeface {
  /** Familjen som laddas från Google Fonts; `null` = systemets typsnitt. */
  webFamily: string | null;
  /** True när webFamily ersätter sajtens eget, olicensierade typsnitt. */
  substitute: boolean;
  /** CSS-stacken: sajtens eget namn först, ifall besökaren har det installerat. */
  stack: string;
}

export function substituteFor(family: string): string | null {
  const tidy = tidyFamily(family);
  return googleFamilyFor(family) ?? SUBSTITUTES.find(([pattern]) => pattern.test(tidy))?.[1] ?? null;
}

const quote = (family: string) => `"${family.replace(/["\\]/g, "")}"`;

export function shopTypeface(font: ShopFont | null | undefined): ShopTypeface {
  const family = font?.family?.trim() || null;
  if (!family) return { webFamily: null, substitute: false, stack: SANS_FALLBACK };
  if (font?.google) {
    return { webFamily: family, substitute: false, stack: `${quote(family)}, ${SANS_FALLBACK}` };
  }
  const replacement = substituteFor(family);
  const fallback = replacement && SERIF_FAMILY.test(replacement) ? SERIF_FALLBACK : SANS_FALLBACK;
  return {
    webFamily: replacement,
    substitute: replacement !== null,
    stack: [quote(family), replacement && quote(replacement), fallback].filter(Boolean).join(", "),
  };
}

/** Gravyrtypsnittet som liknar sajtens mest — leverantören graverar bara Arial och Arial Narrow. */
export function engravingFontFor(font: ShopFont | null | undefined): FontId {
  const family = font?.family;
  if (!family) return "arial";
  return CONDENSED.test(tidyFamily(family)) ? "arial-narrow" : matchFont([family]).fontId;
}
