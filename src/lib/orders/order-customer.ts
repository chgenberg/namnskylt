import "server-only";
import { z } from "zod";
import { orgNumberSchema } from "@/lib/company/org-number";
import { isOwner } from "@/lib/tenants/model";
import { ERASED_CUSTOMER_ERROR, isErasedCustomer } from "./erase-model";
import type { Customer } from "./model";
import { getCustomer, upsertCustomer } from "./repository";
import { isUnassignedCustomer } from "./unassigned-customer";

const optionalText = (max: number) => z.string().trim().max(max).optional();

/** En ny kund, skriven i skyltmotorns varukorg av den som är inloggad i panelen. */
const newCustomerSchema = z.object({
  name: z.string().trim().min(1, "Ange kundens kontaktperson").max(120),
  email: z.email("Ange kundens e-postadress").max(200),
  company: optionalText(120),
  phone: optionalText(40),
  orgNumber: optionalText(20),
});

/**
 * Kunden en order eller offert från skyltmotorn gäller: en av säljarens
 * befintliga kunder (`customerId`) eller en ny (`customer`). Fälten läggs i
 * anropets schema.
 */
export const orderCustomerFields = { customerId: z.uuid().optional(), customer: newCustomerSchema.optional() };

/**
 * Kunden på en offert som säljaren skickar själv, som PDF (beslut av ägaren 2026-11-19: "en ny kund
 * kan sparas med bara ett företagsnamn"). Offerten mejlas inte härifrån, så e-posten behövs inte, och
 * kontaktpersonen är frivillig. Vad som krävs avgörs av `newCustomerOf`.
 */
const looseCustomerSchema = z.object({
  name: optionalText(120),
  email: z.union([z.literal(""), z.email("Kundens e-postadress går inte att läsa").max(200)]).optional(),
  company: optionalText(120),
  phone: optionalText(40),
  orgNumber: optionalText(20),
});

/** Fälten för en offert: en befintlig kund, eller en ny som får sakna kontaktperson och e-post. */
export const quoteCustomerFields = { customerId: z.uuid().optional(), customer: looseCustomerSchema.optional() };

type NewCustomerInput = { name?: string; email?: string; company?: string; phone?: string; orgNumber?: string };
type OrderCustomerInput = { customerId?: string; customer?: NewCustomerInput };

/** Kundens uppgifter som de sparas, eller felet som ska visas. */
export type NewCustomerResult =
  | { ok: true; customer: { name: string; email: string; company: string | null; phone: string | null } }
  | { ok: false; error: string };

/**
 * Vad en ny kund ska ha. Vanligtvis kontaktperson och e-post. Med `minimal` (en offert som en
 * återförsäljare skickar själv) räcker ett företagsnamn eller ett namn: e-posten sparas då tom, och
 * saknas kontaktpersonen står företagets namn där. Hos namnskylt.com gäller alltid de fulla kraven,
 * eftersom verkstaden fakturerar och aviserar kunden.
 */
export function newCustomerOf(input: NewCustomerInput, minimal: boolean): NewCustomerResult {
  const name = input.name?.trim() ?? "";
  const email = input.email?.trim() ?? "";
  const company = input.company?.trim() ?? "";
  if (!minimal) {
    if (!name) return { ok: false, error: "Ange kundens kontaktperson" };
    if (!email) return { ok: false, error: "Ange kundens e-postadress" };
  } else if (!name && !company) {
    return { ok: false, error: "Ange kundens företag eller namn" };
  }
  return { ok: true, customer: { name: name || company, email, company: company || null, phone: input.phone?.trim() || null } };
}

export type OrderCustomerResult = { ok: true; customer: Customer } | { ok: false; error: string; status: number };

/** Det som saknas för att verkstaden ska kunna fakturera kunden. */
const INVOICE_DETAILS_ERROR = "Ange kundens företag och organisationsnummer. Skylt & Gravyrteknik fakturerar kunden.";

/**
 * Slår upp eller skapar kunden. En ny kund med en e-post som redan finns hos
 * säljaren är samma kund: ifyllda uppgifter skriver över, tomma behåller det
 * gamla, som när kunden läggs upp i panelen.
 *
 * Hos namnskylt.com fakturerar Skylt & Gravyrteknik kunden. Företaget och
 * organisationsnumret krävs därför redan här, också för en kund ur listan:
 * annars mejlades en offert som inte går att göra till en order.
 */
export async function resolveOrderCustomer(
  tenant: string,
  input: OrderCustomerInput,
  /** En offert som en återförsäljare skickar själv: kunden får sakna kontaktperson och e-post. Gäller aldrig namnskylt.com. */
  { minimal = false }: { minimal?: boolean } = {},
): Promise<OrderCustomerResult> {
  if (input.customerId) {
    const customer = await getCustomer(tenant, input.customerId);
    if (!customer) return { ok: false, error: "Kunden finns inte", status: 404 };
    if (isErasedCustomer(customer)) return { ok: false, error: ERASED_CUSTOMER_ERROR, status: 409 };
    // En demokund går aldrig till verkstaden och behöver inga fakturauppgifter.
    if (isOwner(tenant) && !customer.demo && !(customer.company?.trim() && customer.orgNumber?.trim())) {
      return {
        ok: false,
        error: "Kunden saknar företag eller organisationsnummer, som Skylt & Gravyrteknik behöver för fakturan. Välj Ny kund och fyll i dem med samma e-post.",
        status: 400,
      };
    }
    return { ok: true, customer };
  }
  if (!input.customer) return { ok: false, error: "Välj en kund, eller fyll i en ny", status: 400 };
  const fresh = newCustomerOf(input.customer, minimal && !isOwner(tenant));
  if (!fresh.ok) return { ok: false, error: fresh.error, status: 400 };
  // En borttagen kunds rad får aldrig skrivas över med nya uppgifter.
  if (isErasedCustomer({ email: fresh.customer.email.toLowerCase() })) return { ok: false, error: ERASED_CUSTOMER_ERROR, status: 409 };
  // Inte heller platshållaren som utkast utan kund pekar på.
  if (isUnassignedCustomer(fresh.customer)) return { ok: false, error: "Kundens e-postadress går inte att använda", status: 400 };
  const typed = input.customer.orgNumber ?? "";
  const orgNumber = typed ? orgNumberSchema.safeParse(typed) : null;
  if (orgNumber && !orgNumber.success) return { ok: false, error: "Kundens organisationsnummer ska ha tio siffror", status: 400 };
  if (isOwner(tenant) && !(orgNumber && fresh.customer.company)) return { ok: false, error: INVOICE_DETAILS_ERROR, status: 400 };
  const customer = await upsertCustomer(tenant, { ...fresh.customer, orgNumber: orgNumber?.data ?? null });
  return { ok: true, customer };
}
