import { isBrandColor, parseCssColor, toHex, colorDistance, type Rgb } from "./color";

const GENERIC_FAMILIES = new Set([
  "serif",
  "sans-serif",
  "monospace",
  "cursive",
  "fantasy",
  "system-ui",
  "ui-sans-serif",
  "ui-serif",
  "ui-monospace",
  "-apple-system",
  "blinkmacsystemfont",
  "inherit",
  "initial",
  "unset",
  "revert",
  "emoji",
  "math",
]);
const ICON_FONT = /icon|awesome|material symbols|glyph|dashicons|swiper|slick|fontello|eicons|ionicons|feather/i;
/** Selektorer vars typsnitt och färg präglar sidan. */
const KEY_SELECTOR = /(^|[\s,>])(html|body|:root|h1|h2|h3|header|nav)\b/i;
const ACCENT_SELECTOR = /btn|button|cta|primary|header|nav|hero|banner/i;
const BRAND_VARIABLE = /--[\w-]*(primary|brand|accent|main|theme|highlight)[\w-]*/i;

const DECLARATION = /([{;]\s*)(--[\w-]+|[a-z-]+)\s*:\s*([^;{}]+)/gi;
const COLOR_TOKEN = /#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/gi;
const SIMILAR_COLOR_DISTANCE = 12;
const MAX_COLORS = 5;

/** Selektorn närmast före position `i` i CSS:en. */
function selectorAt(css: string, i: number): string {
  const open = css.lastIndexOf("{", i);
  if (open < 0) return "";
  const start = Math.max(css.lastIndexOf("}", open), css.lastIndexOf(";", open), css.lastIndexOf("{", open - 1));
  return css.slice(start + 1, open).trim();
}

/** Ett familjenamn: bokstäver, siffror, mellanslag och bindestreck — inte mått eller nyckelord. */
const FAMILY_NAME = /^[\p{L}][\p{L}\d .'-]*$/u;
const FAMILY_KEYWORD = /^(normal|bold|bolder|lighter|italic|oblique|none|auto)$/i;
const FAMILY_VARIABLE =
  /^--[\w-]*(font-?family|typeface)[\w-]*$|^--[\w-]*font-(sans|serif|body|heading|headline|primary|secondary|base|display|text|brand)$/i;

/** Första riktiga familjen i en `font-family`-lista. */
export function primaryFamily(list: string): string | null {
  for (const raw of list.split(",")) {
    const family = raw
      .replace(/!important/i, "")
      .replace(/^\s*var\([^,]*$/, "")
      .replace(/[()]/g, "")
      .trim()
      .replace(/^["']|["']$/g, "")
      .trim();
    if (!family || GENERIC_FAMILIES.has(family.toLowerCase())) continue;
    if (!FAMILY_NAME.test(family) || FAMILY_KEYWORD.test(family)) continue;
    if (ICON_FONT.test(family)) return null;
    return family;
  }
  return null;
}

/** Typsnitten sidan använder, viktigast först. */
export function fontFamilies(css: string, extra: readonly string[] = []): string[] {
  const weights = new Map<string, number>();
  const add = (family: string | null, weight: number) => {
    if (!family) return;
    weights.set(family, (weights.get(family) ?? 0) + weight);
  };
  for (const m of css.matchAll(DECLARATION)) {
    const property = m[2]?.toLowerCase() ?? "";
    const value = m[3] ?? "";
    const isFamily = property === "font-family" || FAMILY_VARIABLE.test(property);
    if (!isFamily) continue;
    const selector = selectorAt(css, m.index);
    add(primaryFamily(value), KEY_SELECTOR.test(selector) ? 5 : property.startsWith("--") ? 3 : 1);
  }
  extra.forEach((family) => add(family, 4));
  return [...weights.entries()].sort((a, b) => b[1] - a[1]).map(([family]) => family);
}

/** Varumärkesfärger ur vägda färgprov, starkast först. Neutrala (vitt, svart, grått) räknas inte. */
export function rankColors(samples: readonly { color: string; weight: number }[]): string[] {
  const collector = colorCollector();
  for (const sample of samples) collector.add(parseCssColor(sample.color), sample.weight);
  return collector.ranked();
}

/** Webbläsarens standardfärger för länkar — finns på sidor som inte stylat alla länkar. */
const BROWSER_LINK_COLORS = new Set(["#0000ee", "#551a8b", "#0000ff"]);

function colorCollector() {
  const buckets: { rgb: Rgb; weight: number }[] = [];
  return {
    add(rgb: Rgb | null, weight: number) {
      if (!rgb || !isBrandColor(rgb) || BROWSER_LINK_COLORS.has(toHex(rgb))) return;
      const near = buckets.find((b) => colorDistance(b.rgb, rgb) < SIMILAR_COLOR_DISTANCE);
      if (near) near.weight += weight;
      else buckets.push({ rgb, weight });
    },
    ranked: () =>
      buckets
        .sort((a, b) => b.weight - a.weight)
        .slice(0, MAX_COLORS)
        .map((b) => toHex(b.rgb)),
  };
}

/** Varumärkesfärgerna, starkast signal först. Neutrala (vitt, svart, grått) räknas inte. */
export function brandColors(css: string, themeColor: string | null = null): string[] {
  const { add, ranked } = colorCollector();
  if (themeColor) add(parseCssColor(themeColor), 12);
  for (const m of css.matchAll(DECLARATION)) {
    const property = m[2] ?? "";
    const value = m[3] ?? "";
    const tokens = value.match(COLOR_TOKEN);
    if (!tokens) continue;
    let weight = 1;
    if (BRAND_VARIABLE.test(property)) weight = 8;
    else if (/background|^color$|border-color|fill/i.test(property) && ACCENT_SELECTOR.test(selectorAt(css, m.index))) {
      weight = 3;
    }
    for (const token of tokens) add(parseCssColor(token), weight);
  }
  return ranked();
}
