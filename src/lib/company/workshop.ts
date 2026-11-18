/**
 * Skylt & Gravyrteknik, som driver namnskylt.com: de säljer, tillverkar, levererar och
 * fakturerar, är personuppgiftsansvariga och är dem kunden kontaktar. namnskylt.com är inget
 * eget bolag (besked av ägaren 2026-11-18: "allt det här sköts ju av Skylt & Gravyrteknik
 * AB"). Uppgifterna är deras egna, som de står på skyltochgravyr.com, och används i
 * köpvillkoren, integritetspolicyn och på sidorna Om oss och Kontakta oss.
 */
export const WORKSHOP_COMPANY = {
  name: "Skylt & Gravyrteknik",
  legalName: "Skylt & Gravyrteknik i Sverige AB",
  orgNumber: "556464-2261",
  street: "F O Petersons gata 28",
  zipCity: "421 31 Västra Frölunda",
  /** Stadsdelen och staden, som de själva skriver: "Teamet i Högsbo, Göteborg". */
  area: "Högsbo, Göteborg",
  phone: "031-709 02 92",
  phoneHref: "+46317090292",
  email: "order@skyltochgravyr.com",
  /** Öppettider för verkstaden och butiken i Högsbo. */
  hours: "Mån–tor 08–17 · fre 08–16",
  site: "https://www.skyltochgravyr.com",
} as const;
