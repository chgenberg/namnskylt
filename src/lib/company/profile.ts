import { z } from "zod";

/** Återförsäljarens egna uppgifter — de som står på offerten och kundens offertsida. */
export interface CompanyProfile {
  name: string;
  tagline: string;
  orgNumber: string;
  address: string;
  email: string;
  phone: string;
  website: string;
  bankgiro: string;
  /** PNG/JPEG/WebP som data-URL; PDF:en hämtar inget utifrån. */
  logo: string | null;
  primaryColor: string;
  accentColor: string;
  /** Villkor i offertens sidfot, t.ex. betalningsvillkor. */
  quoteTerms: string;
}

export const DEFAULT_COMPANY: CompanyProfile = {
  name: "namnskylt.com",
  tagline: "Graverade namnskyltar",
  orgNumber: "",
  address: "",
  email: "",
  phone: "",
  website: "namnskylt.com",
  bankgiro: "",
  logo: null,
  primaryColor: "#0b1f3a",
  accentColor: "#0b7a4b",
  quoteTerms: "",
};

/** Base64 växer med en tredjedel — det här rymmer en logga på drygt 400 kB. */
export const MAX_LOGO_DATA_URL_CHARS = 600_000;
const LOGO_DATA_URL = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

const text = (max: number) => z.string().trim().max(max);

export const companyProfileSchema = z.object({
  name: z.string().trim().min(1, "Företagsnamn krävs").max(120),
  tagline: text(120),
  orgNumber: text(20),
  address: text(300),
  email: z.union([z.literal(""), z.email().max(200)]),
  phone: text(40),
  website: text(200),
  bankgiro: text(20),
  logo: z.string().max(MAX_LOGO_DATA_URL_CHARS).regex(LOGO_DATA_URL, "Loggan måste vara PNG, JPEG eller WebP").nullable(),
  primaryColor: z.string().regex(HEX_COLOR).transform((c) => c.toLowerCase()),
  accentColor: z.string().regex(HEX_COLOR).transform((c) => c.toLowerCase()),
  quoteTerms: text(500),
}) satisfies z.ZodType<CompanyProfile, unknown>;

export function isHexColor(value: string): boolean {
  return HEX_COLOR.test(value);
}

/** Svart eller vit text — det som syns bäst på färgen (WCAG-luminans). */
export function readableOn(hex: string): "#ffffff" | "#0a0a0b" {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
  return luminance > 0.4 ? "#0a0a0b" : "#ffffff";
}

/** Raderna i offertens sidfot, tomma uppgifter utelämnade. */
export function companyFooter(company: CompanyProfile): string[] {
  return [
    [company.name, company.orgNumber && `Org.nr ${company.orgNumber}`].filter(Boolean).join(" · "),
    company.address.replace(/\s*\n\s*/g, ", "),
    [company.phone, company.email, company.website].filter(Boolean).join(" · "),
    company.bankgiro && `Bankgiro ${company.bankgiro}`,
  ].filter(Boolean);
}
