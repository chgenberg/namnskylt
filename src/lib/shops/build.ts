import "server-only";
import { DEFAULT_COMPANY, type CompanyProfile } from "@/lib/company/profile";
import { scrapeCompany } from "@/lib/company/scrape";
import { googleFontsHref, pickFontFamily, type Shop } from "./model";
import { createShop } from "./repository";

const FONT_CHECK_TIMEOUT_MS = 4_000;
/** Har sidan bara en färg blir accenten neutral, så att markeringar inte smälter ihop med knapparna. */
const NEUTRAL_ACCENT = "#1f2937";

/** Google svarar 400 på familjer de inte har — då får butiken sajtens eget typsnitt. */
async function onGoogleFonts(family: string): Promise<boolean> {
  const response = await fetch(googleFontsHref(family), { signal: AbortSignal.timeout(FONT_CHECK_TIMEOUT_MS) }).catch(
    () => null,
  );
  return response?.ok ?? false;
}

/** Butiken ur hemsidan: logga, färger, kontaktuppgifter och typsnitt. */
export async function buildShop(url: string): Promise<Shop> {
  const found = await scrapeCompany(url);
  const [primary, accent] = found.colors;
  const family = pickFontFamily(found.fonts);
  const profile: CompanyProfile = {
    ...DEFAULT_COMPANY,
    name: found.name ?? found.website,
    tagline: found.tagline ?? "",
    website: found.website,
    email: found.contacts.email ?? "",
    phone: found.contacts.phone ?? "",
    orgNumber: found.contacts.orgNumber ?? "",
    address: found.contacts.address ?? "",
    logo: found.logoOptions[0] ?? null,
    primaryColor: primary ?? DEFAULT_COMPANY.primaryColor,
    accentColor: accent && accent !== primary ? accent : primary ? NEUTRAL_ACCENT : DEFAULT_COMPANY.accentColor,
  };
  return createShop({
    profile,
    font: { family, google: family ? await onGoogleFonts(family) : false },
    sourceUrl: found.website,
  });
}
