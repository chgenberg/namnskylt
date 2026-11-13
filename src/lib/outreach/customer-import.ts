import type { Table } from "../spreadsheet/read-table";
import { type Country, emailDomain, isEmailLike, normalizeEmail, relationSegment, type Wave } from "./model";

/**
 * Tolkar bladen `SWE` och `Norge` i kundlistan (PROFIL KUNDER 2026.xlsx).
 * Ren funktion — skriver ingenting och loggar inga personuppgifter.
 */

export const CUSTOMER_SHEETS = ["SWE", "Norge"] as const;

export type CheckReason =
  | "missing-email"
  | "multiple-emails"
  | "contact-is-email"
  | "free-mail"
  | "shared-domain"
  | "unknown-country"
  | "already-reseller";

/** De här stoppar raden helt; övriga är bara till för operatörens granskning. */
const BLOCKING_REASONS: readonly CheckReason[] = ["missing-email", "unknown-country", "already-reseller"];

export function isBlockingReason(reason: CheckReason): boolean {
  return BLOCKING_REASONS.includes(reason);
}

export interface ImportedLead {
  email: string;
  contactName: string | null;
  companyName: string;
  phone: string | null;
  city: string | null;
  country: Country;
  customerSince: string | null;
  activated: boolean;
  known: boolean;
  website: string | null;
  upShopUrl: string | null;
  wave: Wave | null;
  checkReasons: CheckReason[];
}

const FREE_MAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "hotmail.com",
  "hotmail.se",
  "hotmail.no",
  "outlook.com",
  "outlook.se",
  "live.se",
  "live.com",
  "msn.com",
  "yahoo.com",
  "yahoo.se",
  "icloud.com",
  "me.com",
  "telia.com",
  "online.no",
]);

function isFreeMail(email: string): boolean {
  return FREE_MAIL_DOMAINS.has(emailDomain(email));
}

const COLUMN = {
  company: "Företag",
  phone: "Telefonnummer",
  city: "Ort",
  country: "Land",
  contact: "Kontaktperson",
  email: "Kontakt-mail",
  website: "Hemsida",
  customerSince: "Blev kund",
  activated: "Aktiverat sortiment",
  known: "Känd/inte känd",
} as const;

/** Excel räknar dagar från 1899-12-30 (med 1900-buggen inbakad). */
const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);
const MS_PER_DAY = 86_400_000;

export function excelSerialToIsoDate(value: string): string | null {
  const serial = Number(value);
  if (!Number.isFinite(serial) || serial < 1 || serial > 100_000) return null;
  return new Date(EXCEL_EPOCH_MS + Math.floor(serial) * MS_PER_DAY).toISOString().slice(0, 10);
}

function cleanCell(value: string | undefined): string {
  return (value ?? "")
    .replace(/&nbsp;/gi, " ")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseCountry(value: string): Country | null {
  const v = value.toLowerCase();
  if (v === "sverige" || v === "se" || v === "sweden") return "se";
  if (v === "norge" || v === "no" || v === "norway") return "no";
  if (v === "ax" || v === "åland" || v === "aland") return "ax";
  return null;
}

function isActivated(value: string): boolean {
  return /^har aktiverat/i.test(value);
}

function isKnown(value: string): boolean {
  return /^ja$/i.test(value);
}

/** Två sista leden — räcker för .se, .no, .com och .ax. */
function registrableDomain(host: string): string {
  const labels = host.toLowerCase().replace(/^www\./, "").split(".").filter(Boolean);
  return labels.slice(-2).join(".");
}

function hostOf(url: string): string | null {
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * `Hemsida` pekar ofta på en butik hos United Profile. Mejldomänen är då
 * återförsäljarens egen sajt; den andra adressen sparas men skrapas inte.
 */
export function websiteFor(email: string, homepage: string): { website: string | null; upShopUrl: string | null } {
  const mailDomain = emailDomain(email);
  const homepageHost = homepage ? hostOf(homepage) : null;
  if (!mailDomain || isFreeMail(email)) {
    return { website: null, upShopUrl: homepage || null };
  }
  if (homepageHost && registrableDomain(homepageHost) === registrableDomain(mailDomain)) {
    return { website: `https://${homepageHost}`, upShopUrl: null };
  }
  return { website: `https://${registrableDomain(mailDomain)}`, upShopUrl: homepage || null };
}

/** Förslag på våg utifrån masterplanens utrullning; operatören kan ändra. */
function suggestedWave(lead: Pick<ImportedLead, "country" | "activated" | "known">): Wave {
  if (lead.country !== "se") return "NO";
  if (lead.known) return "A";
  return lead.activated ? "B" : "C";
}

export function firstName(contactName: string | null): string | null {
  const first = contactName?.split(" ")[0]?.trim();
  return first && first.length >= 2 ? first : null;
}

function headerIndex(table: Table): Map<string, number> {
  const header = (table[0] ?? []).map((cell) => cleanCell(cell));
  return new Map(header.map((name, i) => [name, i]));
}

export class CustomerSheetError extends Error {}

export interface ParsedSheet {
  rows: number;
  leads: ImportedLead[];
  duplicates: number;
  missingEmail: number;
}

/** En rad per kontaktadress; dubbletter slås ihop, delade domäner flaggas. */
export function parseCustomerSheet(table: Table): ParsedSheet {
  const columns = headerIndex(table);
  for (const required of [COLUMN.company, COLUMN.email, COLUMN.country]) {
    if (!columns.has(required)) throw new CustomerSheetError(`Kolumnen ${required} saknas i bladet`);
  }
  const cell = (row: string[], name: string) => {
    const index = columns.get(name);
    return index === undefined ? "" : cleanCell(row[index]);
  };

  const byEmail = new Map<string, ImportedLead>();
  let rows = 0;
  let duplicates = 0;
  let missingEmail = 0;
  for (const row of table.slice(1)) {
    const companyName = cell(row, COLUMN.company);
    if (!companyName) continue;
    rows++;

    const reasons: CheckReason[] = [];
    const addresses = cell(row, COLUMN.email).split(/[;,\s]+/).filter(isEmailLike);
    const email = addresses[0] ? normalizeEmail(addresses[0]) : "";
    if (!email) reasons.push("missing-email");
    if (addresses.length > 1) reasons.push("multiple-emails");

    const contact = cell(row, COLUMN.contact);
    const contactIsEmail = isEmailLike(contact);
    if (contactIsEmail) reasons.push("contact-is-email");
    const contactName = contactIsEmail || contact.length < 2 ? null : contact;

    const country = parseCountry(cell(row, COLUMN.country));
    if (!country) reasons.push("unknown-country");
    if (email && isFreeMail(email)) reasons.push("free-mail");

    if (!email) {
      missingEmail++;
      continue;
    }
    if (byEmail.has(email)) {
      duplicates++;
      continue;
    }

    const activated = isActivated(cell(row, COLUMN.activated));
    const known = isKnown(cell(row, COLUMN.known));
    const resolvedCountry = country ?? "se";
    const { website, upShopUrl } = websiteFor(email, cell(row, COLUMN.website));
    byEmail.set(email, {
      email,
      contactName,
      companyName,
      phone: cell(row, COLUMN.phone) || null,
      city: cell(row, COLUMN.city) || null,
      country: resolvedCountry,
      customerSince: excelSerialToIsoDate(cell(row, COLUMN.customerSince)),
      activated,
      known,
      website,
      upShopUrl,
      wave: country ? suggestedWave({ country: resolvedCountry, activated, known }) : null,
      checkReasons: reasons,
    });
  }

  const domainCount = new Map<string, number>();
  for (const lead of byEmail.values()) {
    if (isFreeMail(lead.email)) continue;
    const domain = emailDomain(lead.email);
    domainCount.set(domain, (domainCount.get(domain) ?? 0) + 1);
  }
  for (const lead of byEmail.values()) {
    if ((domainCount.get(emailDomain(lead.email)) ?? 0) > 1) lead.checkReasons.push("shared-domain");
  }
  return { rows, leads: [...byEmail.values()], duplicates, missingEmail };
}

export interface ImportSummary {
  rows: number;
  leads: number;
  duplicates: number;
  missingEmail: number;
  byCountry: Record<string, number>;
  bySegment: Record<string, number>;
  byWave: Record<string, number>;
  byReason: Record<string, number>;
}

/** Räknare för torrkörningen — aldrig namn eller adresser. */
export function summarizeImport(sheets: readonly ParsedSheet[]): ImportSummary {
  const leads = sheets.flatMap((s) => s.leads);
  const count = (keys: string[]) =>
    keys.reduce<Record<string, number>>((acc, key) => ({ ...acc, [key]: (acc[key] ?? 0) + 1 }), {});
  return {
    rows: sheets.reduce((n, s) => n + s.rows, 0),
    leads: leads.length,
    duplicates: sheets.reduce((n, s) => n + s.duplicates, 0),
    missingEmail: sheets.reduce((n, s) => n + s.missingEmail, 0),
    byCountry: count(leads.map((l) => l.country)),
    bySegment: count(leads.map((l) => `${l.country}:${relationSegment(l)}`)),
    byWave: count(leads.map((l) => l.wave ?? "–")),
    byReason: count(leads.flatMap((l) => l.checkReasons)),
  };
}
