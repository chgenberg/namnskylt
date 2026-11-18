import { orgNumberDigits } from "./org-number";

/**
 * Företagets uppgifter ur ett öppet register, för att fylla i kassan när
 * kunden har skrivit sitt organisationsnummer (besked av ägaren 2026-11-18).
 *
 * Källan är EU:s momsregister VIES, som svarar gratis och utan nyckel med
 * namn och adress för ett momsregistrerat företag. ABPI, som användes i ett
 * annat av ägarens projekt, är nedlagt sedan dess.
 */
export interface CompanyHit {
  /** Företagets namn som det står i registret. */
  name: string;
  line1: string;
  /** c/o eller en andra adressrad. */
  line2: string;
  /** Skrivet `123 45`. */
  zip: string;
  city: string;
}

/**
 * Numret som får slås upp: tio siffror för en juridisk person, eller `null`.
 * En enskild firma har ägarens personnummer som organisationsnummer. Det
 * känns igen på att tredje siffran är 0 eller 1, och skickas aldrig till ett
 * register utanför sajten.
 */
export function lookupNumber(raw: string | null | undefined): string | null {
  const digits = orgNumberDigits(raw);
  return digits && Number(digits[2]) >= 2 ? digits : null;
}

/** Sveriges momsregistreringsnummer utan landskod: organisationsnumret följt av 01. */
export function vatNumberOf(digits: string): string {
  return `${digits}01`;
}

const ZIP_AND_CITY = /^(\d{3})\s?(\d{2})\s+(\S.*)$/;

/** Registret skriver adresser med versaler. Namn rörs inte: IKEA och SAAB ska stå som de står. */
function readable(text: string): string {
  if (/[a-zåäöé]/.test(text)) return text;
  return text.toLowerCase().replace(/(^|[\s\-/])([a-zåäöé])/g, (_, before: string, letter: string) => `${before}${letter.toUpperCase()}`);
}

/**
 * Adressen som registret lämnar den, rad för rad: gata, ibland c/o, och sist
 * postnummer och ort. Det som saknas eller inte går att tolka blir tomt.
 */
export function parseRegisterAddress(raw: string): Pick<CompanyHit, "line1" | "line2" | "zip" | "city"> {
  const lines = raw
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const last = ZIP_AND_CITY.exec(lines.at(-1) ?? "");
  const street = last ? lines.slice(0, -1) : lines;
  const careOf = street.filter((line) => /^c\/o\b/i.test(line));
  const rest = street.filter((line) => !/^c\/o\b/i.test(line));
  const [line1 = "", ...more] = rest;
  return {
    line1: readable(line1).slice(0, 120),
    line2: [...careOf.map((line) => line.replace(/^c\/o\b/i, "c/o")), ...more.map(readable)].join(", ").slice(0, 120),
    zip: last ? `${last[1]} ${last[2]}` : "",
    city: last ? readable(last[3] ?? "").slice(0, 80) : "",
  };
}

/** Företaget ur momsregistrets svar, eller `null` när numret inte finns där eller svaret inte går att läsa. */
export function companyFromVies(body: unknown): CompanyHit | null {
  if (typeof body !== "object" || body === null) return null;
  const { isValid, name, address } = body as { isValid?: unknown; name?: unknown; address?: unknown };
  if (isValid !== true || typeof name !== "string") return null;
  const clean = name.replace(/\s+/g, " ").trim();
  // Registret svarar med streck för det som saknas.
  if (clean.length < 2 || /^-+$/.test(clean)) return null;
  const parsed = typeof address === "string" && !/^-+$/.test(address.trim()) ? parseRegisterAddress(address) : { line1: "", line2: "", zip: "", city: "" };
  return { name: clean.slice(0, 120), ...parsed };
}

/** Sant när svaret säger att registret inte kunde svara just nu, till skillnad från att numret inte finns. */
export function viesUnavailable(body: unknown): boolean {
  const error = typeof body === "object" && body !== null ? (body as { userError?: unknown }).userError : null;
  return typeof error === "string" && error !== "VALID" && error !== "INVALID";
}

/**
 * Fältets nya värde när registret har svarat: uppgiften fylls i när fältet är
 * tomt, eller bär det som registret fyllde i förra gången. Det kunden själv
 * har skrivit står kvar.
 */
export function filled(current: string, next: string, previous = ""): string {
  if (!next) return current;
  return current.trim() === "" || (previous !== "" && current === previous) ? next : current;
}

/** Fälten i en leveransadress som registret kan fylla i. */
interface AddressFields {
  name: string;
  line1: string;
  line2: string;
  zip: string;
  city: string;
}

/** Leveransadressen med registrets uppgifter ifyllda, enligt samma regel som `filled`. */
export function withCompanyAddress<T extends AddressFields>(draft: T, hit: CompanyHit, previous: CompanyHit | null = null): T {
  return {
    ...draft,
    name: filled(draft.name, hit.name, previous?.name),
    line1: filled(draft.line1, hit.line1, previous?.line1),
    line2: filled(draft.line2, hit.line2, previous?.line2),
    zip: filled(draft.zip, hit.zip, previous?.zip),
    city: filled(draft.city, hit.city, previous?.city),
  };
}
