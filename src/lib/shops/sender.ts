import "server-only";
import { darkPlate, isLightLogo } from "@/lib/images/logo-tone";
import { getCompanyProfile } from "@/lib/orders/repository";
import { isOwner } from "@/lib/tenants/model";
import { shopThemeVars, shopWebFamilies } from "./model";
import { getShop } from "./repository";

/**
 * Den kunden ser som avsändare på korrektur och offert: butiken ordern kom
 * från, annars återförsäljarens företagsprofil. Vi syns bara när det är vår
 * egen webbshop.
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
  const company = await getCompanyProfile(input.resellerId);
  const ours = isOwner(input.resellerId) && !company.logo;
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
    ours,
    themeVars: ours ? {} : colors,
    webFamilies: [],
  };
}
