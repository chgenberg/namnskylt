import type { Country, RelationSegment } from "./model";

/**
 * All text i återförsäljarmejlet, per språk. Mejlet är kort med flit: en knapp som ringer upp och
 * en länk till filmen. Inget som leverantören inte har bekräftat — se `FORBIDDEN_PHRASES`.
 */

export type EmailStep = 1 | 2;
export type OutreachLocale = "sv" | "nb";

export function localeFor(country: Country): OutreachLocale {
  return country === "no" ? "nb" : "sv";
}

export interface CopyContext {
  firstName: string | null;
  company: string;
  segment: RelationSegment;
}

/** Den som visar namnskylt.com, med namn och nummer som de står i mejlet. */
export interface DemoContactText {
  name: string;
  firstName: string;
  phone: string;
}

export interface LocaleCopy {
  subject(step: EmailStep, c: CopyContext): string;
  preheader(step: EmailStep): string;
  greeting(firstName: string | null): string;
  /** Stycket efter hälsningen. */
  lead(step: EmailStep, c: CopyContext): string;
  /** Länken till sidan med filmen. */
  filmLink: string;
  /** Toppbildens alt-text och raden under den, som säger att bilden är AI-genererad. */
  heroAlt(contact: DemoContactText): string;
  heroCaption: string;
  /** Stycket före knappen, om demon. */
  demo(contact: DemoContactText): string;
  /** Knappen: ring den som visar. Mejlets enda knapp. */
  cta(contact: DemoContactText): string;
  closing: string;
  signoff: string;
  relationLine(company: string, customerSinceYear: number | null): string;
  orgNumber: string;
  privacy: string;
  unsubscribe: string;
}

/**
 * «Nordtryck» → «Nordtrycks», «Ljus» → «Ljus», och efter en förkortning eller en siffra med kolon,
 * som svenska skrivregler säger: «Nordtryck & Co AB» → «Nordtryck & Co AB:s», «Profil 24» → «Profil 24:s».
 */
export function genitive(name: string): string {
  if (/(?:\b[A-ZÅÄÖ]{2,}|\d)$/.test(name)) return `${name}:s`;
  return /[sxz]$/i.test(name) ? name : `${name}s`;
}

/**
 * Mejlet är så enkelt det går (besked av ägaren 2026-11-25): en knapp som ringer Pär för en demo på
 * fem minuter, och en länk till filmen, där det också går att be om att bli uppringd. Ingen bild, inga
 * priser och ingen färdig butik. Signerat av gänget, med svar till Skylt & Gravyrteknik.
 */
const sv: LocaleCopy = {
  subject: (step, c) => {
    if (step === 2) return c.firstName ? `${c.firstName}, hann du se filmen?` : "Hann ni se filmen?";
    return c.firstName ? `${c.firstName}, namnskyltar till era kunder?` : "Namnskyltar till era kunder?";
  },
  preheader: (step) =>
    step === 2
      ? "Fem minuter med Pär räcker för att se om det passar er."
      : "Från Skylt & Gravyrteknik: en film på under en minut, eller fem minuter med Pär.",
  greeting: (firstName) => (firstName ? `Hej ${firstName}!` : "Hej!"),
  // "Vi" är Skylt & Gravyrteknik, som mottagaren känner (marknadsagentens granskning 2026-11-25).
  lead: (step, c) =>
    step === 2
      ? `Vi skrev förra veckan om namnskylt.com, där ni gör namnskyltar och offerter åt era kunder. Hann ${c.firstName ? "du" : "ni"} se filmen?`
      : "Vi på Skylt & Gravyrteknik lanserar nu namnskylt.com – ett enklare sätt att designa namnskyltar med era kunders logotyper och skapa färdiga offerter med era egna priser. Vi tillverkar och skickar.",
  filmLink: "Se hur det funkar, på under en minut",
  heroAlt: (contact) => `${contact.name} med en namnskylt från namnskylt.com`,
  // AI-förordningen och Merchins regel: en AI-bild visas aldrig som om den vore ett foto.
  heroCaption: "Bilden är AI-genererad. Skylten finns på riktigt.",
  demo: (contact) => `${contact.name} från Merchin, som utvecklat plattformen tillsammans med oss, visar dig hur det fungerar på fem minuter.`,
  cta: (contact) => `Ring ${contact.firstName}: ${contact.phone}`,
  // Ägarens text 2026-11-25 slutar vid knappen; svar går ändå till hej@namnskylt.com.
  closing: "",
  signoff: "Hälsningar,",
  // Kundrelationen är Skylt & Gravyrtekniks, som står bakom namnskylt.com (besked av ägaren 2026-11-25).
  relationLine: (company, year) =>
    year
      ? `Ni får det här för att ${company} är kund hos Skylt & Gravyrteknik sedan ${year}.`
      : `Ni får det här för att ${company} är kund hos Skylt & Gravyrteknik.`,
  orgNumber: "Org.nr",
  privacy: "Så hanterar vi uppgifter",
  unsubscribe: "Avregistrera",
};

/** Norska texter läggs till när den norska vågen öppnas; tills dess byggs inget norskt mejl. */
export const COPY: Partial<Record<OutreachLocale, LocaleCopy>> = { sv };

/**
 * Det mejlet inte får lova (masterplan avsnitt 4). Priser och leveranstider
 * bekräftas av leverantören först; mässing och akryl tillverkas inte automatiskt.
 */
export const FORBIDDEN_PHRASES: readonly { label: string; pattern: RegExp }[] = [
  { label: "kronbelopp", pattern: /\d[\d\s]*(kr\b|kronor|sek\b|:-)/i },
  { label: "procent", pattern: /\d\s*%|procent/i },
  { label: "marginal", pattern: /marginal/i },
  { label: "på en dag", pattern: /på en dag/i },
  { label: "osynlig leverantör", pattern: /ser aldrig vårt namn/i },
  { label: "order direkt", pattern: /ordrarna går direkt/i },
  { label: "betalning i butiken", pattern: /betalar i butiken/i },
  { label: "egen domän", pattern: /egen domän|egna domän/i },
  { label: "mässing", pattern: /mässing/i },
  { label: "akryl", pattern: /akryl/i },
  { label: "leveranstid", pattern: /arbetsdagar/i },
  { label: "gratis", pattern: /gratis|kostnadsfri/i },
];

export function forbiddenIn(text: string): string[] {
  return FORBIDDEN_PHRASES.filter((p) => p.pattern.test(text)).map((p) => p.label);
}
