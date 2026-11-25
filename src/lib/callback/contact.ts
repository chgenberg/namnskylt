/**
 * Den som visar namnskylt.com för en återförsäljare, och inkorgen dit förfrågningar om att bli uppringd
 * går (besked av ägaren 2026-11-25: "Det viktiga är att dom ska ringa Pär Philipson för en 5 minuters
 * demo", och "då får hej@namnskylt.com ett mail där vi ringer upp"). Numret står i utskicksmejlet och
 * på sidan med filmen, och är till för att synas.
 */
export const DEMO_CONTACT = {
  name: "Pär Philipson",
  firstName: "Pär",
  /** Som det skrivs i text. */
  phone: "076-188 48 00",
  /** För en `tel:`-länk. */
  tel: "+46761884800",
} as const;

/** Inkorgen hos One där namnskylt.coms gäng läser förfrågningarna. */
export const CALLBACK_INBOX = "hej@namnskylt.com";

/** Sidan med filmen och formuläret, dit utskicksmejlet länkar. */
export const DEMO_PATH = "/demo";
