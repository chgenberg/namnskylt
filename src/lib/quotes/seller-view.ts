import "server-only";
import { siteLogoDataUrl } from "@/lib/company/site-logo";
import type { SellerProfile } from "@/lib/company/seller";
import { darkPlate, isLightLogo } from "@/lib/images/logo-tone";
import { getSellerProfile } from "@/lib/orders/repository";

/** Säljaren som offertens dokument ritas med: uppgifterna, loggan som data och plattan bakom en ljus logga. */
export interface QuoteSellerView {
  company: SellerProfile;
  /** Färgen bakom en vit logga, så att den syns på det vita papperet. */
  plate: string | null;
}

/**
 * Säljaren för offertens dokument, lika i PDF:en och i förhandsvisningen i skyltmotorn, så att
 * det säljaren ser innan offerten sparas är det som sedan laddas ner.
 */
export async function quoteSellerView(tenant: string): Promise<QuoteSellerView> {
  const seller = await getSellerProfile(tenant);
  // Sajtens egen logga läggs in som data, eftersom dokumentet ritas ur en fristående sida.
  const company = seller.site ? { ...seller, logo: await siteLogoDataUrl() } : seller;
  const plate = !seller.site && (await isLightLogo(company.logo)) ? darkPlate(company.primaryColor) : null;
  return { company, plate };
}
