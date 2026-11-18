import { DEFAULT_COMPANY, type CompanyProfile } from "./profile";
import { WORKSHOP_COMPANY } from "./workshop";

/**
 * Säljaren som kunden möter på offert, ordersida och korrektur och i mejlen.
 * Hos en återförsäljare är det återförsäljarens egna företagsuppgifter. Hos
 * namnskylt.com är det Skylt & Gravyrteknik (besked av ägaren 2026-11-18: "det
 * ska vara Skylt och Gravyrs uppgifter"): namnskylt.com är deras sajt och inget
 * eget bolag, så panelens företagsuppgifter visas aldrig för kunden.
 */
export interface SellerProfile extends CompanyProfile {
  /** Bolagets fullständiga namn. Det står i sidfoten, där namnet annars står. */
  legalName?: string;
  /** Säljaren är sajten själv. Då visas sajtens egen logga, aldrig en uppladdad. */
  site?: boolean;
}

/**
 * Skylt & Gravyrteknik som säljare på namnskylt.com: deras uppgifter, med
 * sajtens logga och färger. Ur panelens uppgifter följer bara offertens villkor
 * med, eftersom de är adminens egen text om offerten och ingen företagsuppgift.
 */
export function workshopSeller(own: Pick<CompanyProfile, "quoteTerms">): SellerProfile {
  return {
    ...DEFAULT_COMPANY,
    name: WORKSHOP_COMPANY.name,
    legalName: WORKSHOP_COMPANY.legalName,
    tagline: "",
    orgNumber: WORKSHOP_COMPANY.orgNumber,
    address: `${WORKSHOP_COMPANY.street}\n${WORKSHOP_COMPANY.zipCity}`,
    email: WORKSHOP_COMPANY.email,
    phone: WORKSHOP_COMPANY.phone,
    website: "namnskylt.com",
    quoteTerms: own.quoteTerms,
    site: true,
  };
}
