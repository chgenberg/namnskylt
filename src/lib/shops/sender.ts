import "server-only";
import { WORKSHOP_COMPANY } from "@/lib/company/workshop";
import { darkPlate, isLightLogo } from "@/lib/images/logo-tone";
import { getCompanyProfile } from "@/lib/orders/repository";
import { isOwner } from "@/lib/tenants/model";
import { shopThemeVars, shopWebFamilies } from "./model";
import { getShop } from "./repository";

/**
 * Den kunden ser som avsändare på korrekturet: butiken ordern kom från, annars
 * återförsäljarens företagsprofil. Hos namnskylt.com är det alltid sajten själv,
 * som Skylt & Gravyrteknik driver.
 */
export interface Sender {
  name: string;
  logo: string | null;
  /** Mörk platta bakom en ljus logga på genomskinlig botten. */
  logoPlate: string | null;
  /** Butikens adress, för länken tillbaka. */
  shopPath: string | null;
  ours: boolean;
  themeVars: Record<string, string>;
  webFamilies: string[];
}

export async function resolveSender(input: { resellerId: string; shopSlug?: string | null }): Promise<Sender> {
  const shop = input.shopSlug ? await getShop(input.shopSlug).catch(() => null) : null;
  if (shop) {
    return {
      name: shop.profile.name,
      logo: shop.profile.logo,
      logoPlate: (await isLightLogo(shop.profile.logo)) ? darkPlate(shop.profile.primaryColor) : null,
      shopPath: `/butik/${shop.slug}`,
      ours: false,
      themeVars: shopThemeVars(shop),
      webFamilies: shopWebFamilies(shop.font),
    };
  }
  // namnskylt.com är Skylt & Gravyrtekniks sajt: kunden möter sajtens logga och färger, aldrig panelens företagsuppgifter.
  if (isOwner(input.resellerId)) {
    return { name: WORKSHOP_COMPANY.name, logo: null, logoPlate: null, shopPath: null, ours: true, themeVars: {}, webFamilies: [] };
  }
  const company = await getCompanyProfile(input.resellerId);
  // Företagsprofilen har inget typsnitt — då behålls sajtens, bara färgerna byts.
  const colors = Object.fromEntries(
    Object.entries(shopThemeVars({ profile: company, font: { family: null, google: false } })).filter(
      ([key]) => !key.startsWith("--font-"),
    ),
  );
  return {
    name: company.name,
    logo: company.logo,
    logoPlate: (await isLightLogo(company.logo)) ? darkPlate(company.primaryColor) : null,
    shopPath: null,
    ours: false,
    themeVars: colors,
    webFamilies: [],
  };
}
