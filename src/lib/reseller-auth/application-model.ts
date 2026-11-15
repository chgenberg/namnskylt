import { z } from "zod";
import { orgNumberSchema } from "@/lib/company/org-number";
import { deliveryAddressSchema, type DeliveryAddress } from "@/lib/orders/delivery";

/**
 * Det ett företag fyller i för att skapa konto. Blir kontots uppgifter när
 * namnskylt.com har godkänt och den sökande har valt lösenord. Fälten är
 * desamma som när ett företag skapar konto hos Skylt & Gravyrteknik.
 */
export interface ResellerApplicationInput {
  company: string;
  orgNumber: string;
  contactName: string;
  email: string;
  phone: string;
  /** Fakturaadressen: gatuadress, en andra adressrad om den finns, och postnummer och ort på sista raden. */
  address: string;
  /** Dit fakturorna ska mejlas. Tom = samma som `email`. */
  invoiceEmail: string;
  /** Dit skyltarna skickas när de ska till företaget självt. `null` på ansökningar från före fältet. */
  delivery: DeliveryAddress | null;
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
  invoiceEmail: z
    .union([z.literal(""), z.email("Ange en giltig e-postadress för fakturor").max(200)])
    .default("")
    .transform((value) => value.trim().toLowerCase()),
  delivery: deliveryAddressSchema.nullable().default(null),
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
