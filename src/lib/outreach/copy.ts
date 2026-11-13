import type { Country, RelationSegment } from "./model";

/**
 * All text i återförsäljarmejlet, per språk. Mejlet är kort med flit: en
 * bild som väcker nyfikenhet och en länk till resten. Inget som leverantören
 * inte har bekräftat — se `FORBIDDEN_PHRASES`.
 */

export type EmailStep = 1 | 2;
export type OutreachLocale = "sv" | "nb";
export type EmailImageKind = "persona" | "badge";

export function localeFor(country: Country): OutreachLocale {
  return country === "no" ? "nb" : "sv";
}

export interface CopyContext {
  firstName: string | null;
  company: string;
  hasLogo: boolean;
  image: EmailImageKind;
  segment: RelationSegment;
}

export interface LocaleCopy {
  subject(step: EmailStep, c: CopyContext): string;
  preheader(step: EmailStep): string;
  greeting(firstName: string | null): string;
  /** Stycket före bilden. */
  lead(step: EmailStep, c: CopyContext): string;
  /** Stycket efter bilden, före knappen. */
  follow(step: EmailStep, c: CopyContext): string;
  cta: string;
  closing: string;
  signoff: string;
  imageCaption(kind: EmailImageKind, badgeCaption: string): string;
  imageAlt(c: CopyContext): string;
  relationLine(company: string, customerSinceYear: number | null): string;
  orgNumber: string;
  privacy: string;
  unsubscribe: string;
}

/** «Nordtryck» → «Nordtrycks», «Nordtryck & Co AB» → «Nordtryck & Co ABs», «Ljus» → «Ljus». */
export function genitive(name: string): string {
  return /[sxz]$/i.test(name) ? name : `${name}s`;
}

const sv: LocaleCopy = {
  subject: (step, c) => {
    if (step === 2) return `Butiken åt ${c.company} ligger kvar`;
    if (c.hasLogo) return c.firstName ? `${c.firstName}, känner du igen loggan?` : "Känner ni igen loggan?";
    return c.firstName ? `${c.firstName}, vi har gjort något åt ${c.company}` : `Vi har gjort något åt ${c.company}`;
  },
  preheader: (step) => (step === 2 ? "Ifall förra mejlet försvann i inkorgen." : "En bild och en länk. Det tar en halv minut."),
  greeting: (firstName) => (firstName ? `Hej ${firstName}!` : "Hej!"),
  lead: (step, c) => {
    if (step === 2) return "Ville bara höra att bilden kom fram.";
    const what = c.hasLogo ? `${genitive(c.company)} logga på en graverad namnskylt` : `en graverad namnskylt åt ${c.company}`;
    return c.image === "persona" ? `Vi satte ${what} — och lät någon bära den.` : `Vi gjorde ${what}.`;
  },
  follow: (step, c) =>
    step === 2
      ? `Butiken vi byggde åt ${c.company} ligger kvar, ${c.hasLogo ? "med er logga och era färger" : "i era färger"}.`
      : "Bakom länken finns resten: en färdig butik i era färger, där era kunder kan beställa egna skyltar.",
  cta: "Se vad vi byggt åt er",
  closing: "Svara bara på mejlet om du hellre vill att jag ringer.",
  signoff: "Hälsningar",
  imageCaption: (kind, badgeCaption) =>
    kind === "persona" ? `AI-genererad bild. Skylten finns på riktigt: ${badgeCaption}.` : `Skylten: ${badgeCaption}.`,
  imageAlt: (c) => {
    const badge = c.hasLogo ? `en graverad namnskylt med ${genitive(c.company)} logga` : `en graverad namnskylt åt ${c.company}`;
    return c.image === "persona" ? `AI-genererad person som bär ${badge}` : badge.charAt(0).toUpperCase() + badge.slice(1);
  },
  relationLine: (company, year) =>
    year ? `Ni får det här för att ${company} är kund hos oss sedan ${year}.` : `Ni får det här för att ${company} är kund hos oss.`,
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
