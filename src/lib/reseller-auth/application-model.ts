import { z } from "zod";

/** Det ett företag fyller i för att bli återförsäljare. Blir kontots uppgifter när ansökan godkänns. */
export interface ResellerApplicationInput {
  company: string;
  orgNumber: string;
  contactName: string;
  email: string;
  phone: string;
  /** Fakturaadressen: gatuadress på första raden, postnummer och ort på andra. */
  address: string;
  website: string;
  message: string;
}

export type ApplicationStatus = "pending" | "approved" | "rejected";

export const APPLICATION_STATUS_LABEL: Record<ApplicationStatus, string> = {
  pending: "Väntar",
  approved: "Godkänd",
  rejected: "Avslagen",
};

export interface ResellerApplication extends ResellerApplicationInput {
  id: string;
  status: ApplicationStatus;
  /** Kontot som skapades när den sökande valde lösenord; `null` tills dess. */
  accountId: string | null;
  createdAt: string;
  decidedAt: string | null;
}

/** Svenskt organisationsnummer: tio siffror, med eller utan bindestreck. Sparas som `556123-4567`. */
const orgNumberSchema = z
  .string()
  .transform((value) => value.replace(/[\s-]/g, ""))
  .pipe(z.string().regex(/^\d{10}$/, "Organisationsnumret ska ha tio siffror"))
  .transform((digits) => `${digits.slice(0, 6)}-${digits.slice(6)}`);

const text = (max: number) => z.string().trim().max(max);

export const resellerApplicationSchema = z.object({
  company: z.string().trim().min(2, "Företagsnamn krävs").max(120),
  orgNumber: orgNumberSchema,
  contactName: z.string().trim().min(2, "Kontaktperson krävs").max(120),
  email: z
    .email("Ange en giltig e-postadress")
    .max(200)
    .transform((value) => value.trim().toLowerCase()),
  phone: text(40),
  address: z.string().trim().min(5, "Fakturaadress krävs").max(300),
  website: text(200),
  message: text(1000),
}) satisfies z.ZodType<ResellerApplicationInput, unknown>;

/**
 * Kontots id ur företagsnamnet: små bokstäver, siffror och bindestreck, högst
 * 36 tecken. `Exempel & Söner AB` blir `exempel-soner-ab`.
 */
export function tenantSlug(company: string): string {
  const slug = company
    .toLowerCase()
    .replace(/[åä]/g, "a")
    .replace(/ö/g, "o")
    .replace(/é/g, "e")
    .replace(/ü/g, "u")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36)
    .replace(/-+$/g, "");
  return slug.length >= 2 ? slug : "aterforsaljare";
}
