import { z } from "zod";
import { companyProfileSchema, readableOn, type CompanyProfile } from "@/lib/company/profile";

/**
 * En återförsäljares demobutik: deras uppgifter, logga, färger och typsnitt
 * runt vår skyltmotor. Ordrarna landar hos oss, märkta med butiken.
 */
export interface Shop {
  slug: string;
  profile: CompanyProfile;
  /** Typsnittet på deras hemsida; `google` = finns hos Google Fonts och laddas därifrån. */
  font: { family: string | null; google: boolean };
  sourceUrl: string;
  createdAt: string;
}

export const SHOP_SLUG = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
const FONT_FAMILY = /^[A-Za-z0-9][A-Za-z0-9 -]{0,39}$/;

export const shopSchema = z.object({
  slug: z.string().regex(SHOP_SLUG),
  profile: companyProfileSchema,
  font: z.object({ family: z.string().regex(FONT_FAMILY).nullable(), google: z.boolean() }),
  sourceUrl: z.string().max(300),
  createdAt: z.string(),
});

/** "Åsa & Co Profil AB" → "asa-co-profil" — bolagsformen gör adressen bara längre. */
export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(ab|hb|kb|aktiebolag|inc|ltd|gmbh)\b/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
  return slug || "butik";
}

const GENERIC_FAMILY =
  /^(sans-serif|serif|monospace|cursive|fantasy|system-ui|ui-sans-serif|ui-serif|ui-monospace|-apple-system|blinkmacsystemfont|inherit|initial|unset|segoe ui|roboto fallback|arial|helvetica|helvetica neue|times new roman|georgia|verdana|tahoma)$/i;
const ICON_FAMILY = /icon|awesome|dashicons|eicons|slick|glyph|material symbols|swiper/i;

/** Hemsidans eget typsnitt — inte ikontypsnitt, systemtypsnitt eller CSS-variabler. */
export function pickFontFamily(families: readonly unknown[]): string | null {
  for (const raw of families) {
    if (typeof raw !== "string") continue;
    const family = raw.replace(/["']/g, "").trim();
    if (!family || family.startsWith("var(") || GENERIC_FAMILY.test(family) || ICON_FAMILY.test(family)) continue;
    // Google Fonts skiljer på stora och små bokstäver — "open sans" finns inte, "Open Sans" gör.
    if (FONT_FAMILY.test(family)) return family === family.toLowerCase() ? family.replace(/\b[a-z]/g, (c) => c.toUpperCase()) : family;
  }
  return null;
}

export function googleFontsHref(family: string): string {
  return `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, "+")}:wght@400;500;600;700&display=swap`;
}

function rgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

/** `amount` 0–1 mot `toward` (vitt eller svart). */
function mix(hex: string, toward: [number, number, number], amount: number): string {
  const [r, g, b] = rgb(hex);
  const channel = (c: number, t: number) => Math.round(c + (t - c) * amount).toString(16).padStart(2, "0");
  return `#${channel(r, toward[0])}${channel(g, toward[1])}${channel(b, toward[2])}`;
}

const WHITE: [number, number, number] = [255, 255, 255];
const BLACK: [number, number, number] = [0, 0, 0];

function relativeLuminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG AA för vanlig text. */
const TEXT_CONTRAST = 4.5;
const DARKEN_STEP = 0.05;

/** Butikens färg som text på vitt: mörkas i steg tills den går att läsa. */
export function readableTextColor(hex: string): string {
  for (let amount = 0; amount < 1; amount += DARKEN_STEP) {
    const candidate = mix(hex, BLACK, amount);
    if (1.05 / (relativeLuminance(candidate) + 0.05) >= TEXT_CONTRAST) return candidate;
  }
  return "#0a0a0b";
}

/**
 * Butikens färger som sajtens egna tokens: knappar, länkar och markeringar
 * i skyltmotorn läser `--color-navy*`, så hela motorn byter färg utan ny CSS.
 */
export function shopThemeVars(shop: Pick<Shop, "profile" | "font">): Record<string, string> {
  const primary = shop.profile.primaryColor;
  const [r, g, b] = rgb(primary);
  const vars: Record<string, string> = {
    "--color-navy": primary,
    "--color-navy-2": mix(primary, BLACK, 0.18),
    "--color-navy-3": mix(primary, WHITE, 0.12),
    "--color-navy-tint": mix(primary, WHITE, 0.9),
    "--navy-glow": `rgb(${r} ${g} ${b} / 0.1)`,
    "--navy-glow-0": `rgb(${r} ${g} ${b} / 0)`,
    "--navy-ring": `rgb(${r} ${g} ${b} / 0.22)`,
    "--navy-halo": `rgb(${r} ${g} ${b} / 0.08)`,
    "--focus-ring": `0 0 0 3px rgb(${r} ${g} ${b} / 0.3)`,
    "--shop-on": readableOn(primary),
    "--shop-text": readableTextColor(primary),
    "--shop-accent": shop.profile.accentColor,
  };
  // Ett typsnitt som inte går att ladda ger bara systemets reservtypsnitt — då hellre sajtens.
  if (shop.font.family && shop.font.google) {
    vars["--font-sans"] = `"${shop.font.family}", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`;
  }
  return vars;
}
