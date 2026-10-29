import "server-only";
import { z } from "zod";
import { DEFAULT_COMPANY, type CompanyProfile } from "@/lib/company/profile";
import { scrapeCompany } from "@/lib/company/scrape";
import {
  googleFontsHref,
  MAX_COLOR_OPTIONS,
  MAX_LOGO_OPTIONS,
  pickFontFamily,
  type Shop,
  type ShopOptions,
} from "./model";
import { googleFamilyFor } from "./typeface";
import { createShop, getShop, saveShop, saveShopOptions } from "./repository";

const FONT_CHECK_TIMEOUT_MS = 4_000;
/** Har sidan bara en färg blir accenten neutral, så att markeringar inte smälter ihop med knapparna. */
const NEUTRAL_ACCENT = "#1f2937";

/** Google svarar 400 på familjer de inte har — då får butiken sajtens eget typsnitt. */
async function onGoogleFonts(family: string): Promise<boolean> {
  const response = await fetch(googleFontsHref(family), {
    signal: AbortSignal.timeout(FONT_CHECK_TIMEOUT_MS),
  }).catch(() => null);
  return response?.ok ?? false;
}

/** Rubrik- och brödtypsnitt ur sidans CSS, med Googles namn när familjen finns där. */
async function fontsOf(fonts: readonly string[]): Promise<Shop["font"]> {
  // "Inter var" och "Raleway-Semibold" heter något annat hos Google — då sparas Googles namn.
  const canonical = (f: string | null) => (f ? (googleFamilyFor(f) ?? f) : null);
  const family = canonical(pickFontFamily(fonts));
  const bodyFamily = canonical(
    pickFontFamily(fonts.filter((f) => canonical(pickFontFamily([f])) !== family)),
  );
  const [google, bodyGoogle] = await Promise.all([
    family ? onGoogleFonts(family) : false,
    bodyFamily ? onGoogleFonts(bodyFamily) : false,
  ]);
  return { family, google, body: bodyFamily ? { family: bodyFamily, google: bodyGoogle } : null };
}

/** Butiken ur hemsidan: logga, färger, kontaktuppgifter och typsnitt. */
export async function buildShop(url: string, options: { name?: string } = {}): Promise<Shop> {
  const found = await scrapeCompany(url);
  const [primary, accent] = found.colors;
  const profile: CompanyProfile = {
    ...DEFAULT_COMPANY,
    name: options.name?.trim() || found.name || found.website,
    tagline: found.tagline ?? "",
    website: found.website,
    // Skrapade adresser kan ha skräp i sig; en ogiltig får inte stoppa hela butiken.
    email: z.email().safeParse(found.contacts.email).success ? (found.contacts.email ?? "") : "",
    phone: found.contacts.phone ?? "",
    orgNumber: found.contacts.orgNumber ?? "",
    address: found.contacts.address ?? "",
    logo: found.logoOptions[0] ?? null,
    primaryColor: primary ?? DEFAULT_COMPANY.primaryColor,
    accentColor:
      accent && accent !== primary
        ? accent
        : primary
          ? NEUTRAL_ACCENT
          : DEFAULT_COMPANY.accentColor,
  };
  return createShop(
    {
      profile,
      font: await fontsOf(found.fonts),
      sourceUrl: found.website,
    },
    optionsOf(found),
  );
}

function optionsOf(found: { logoOptions: string[]; colors: string[] }): ShopOptions {
  return {
    logos: found.logoOptions.slice(0, MAX_LOGO_OPTIONS),
    colors: [...new Set(found.colors)].slice(0, MAX_COLOR_OPTIONS),
  };
}

/**
 * Läser hemsidan igen: nya loggor och färger att välja bland, och typsnittet
 * med dagens igenkänning. Vald logga och färg ändras inte.
 */
export async function refreshShopOptions(slug: string): Promise<ShopOptions | null> {
  const shop = await getShop(slug);
  if (!shop) return null;
  const found = await scrapeCompany(shop.sourceUrl);
  const options = optionsOf(found);
  await saveShopOptions(slug, options);
  const font = await fontsOf(found.fonts);
  if (font.family) await saveShop({ ...shop, font });
  return options;
}
