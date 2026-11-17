import "server-only";
import { z } from "zod";
import { orgNumberSchema } from "@/lib/company/org-number";
import { isOwner } from "@/lib/tenants/model";
import { ERASED_CUSTOMER_ERROR, isErasedCustomer } from "./erase-model";
import type { Customer } from "./model";
import { getCustomer, upsertCustomer } from "./repository";

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

type OrderCustomerInput = { customerId?: string; customer?: z.infer<typeof newCustomerSchema> };

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
export async function resolveOrderCustomer(tenant: string, input: OrderCustomerInput): Promise<OrderCustomerResult> {
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
  // En borttagen kunds rad får aldrig skrivas över med nya uppgifter.
  if (isErasedCustomer({ email: input.customer.email.trim().toLowerCase() })) return { ok: false, error: ERASED_CUSTOMER_ERROR, status: 409 };
  const typed = input.customer.orgNumber ?? "";
  const orgNumber = typed ? orgNumberSchema.safeParse(typed) : null;
  if (orgNumber && !orgNumber.success) return { ok: false, error: "Kundens organisationsnummer ska ha tio siffror", status: 400 };
  if (isOwner(tenant) && !(orgNumber && input.customer.company)) return { ok: false, error: INVOICE_DETAILS_ERROR, status: 400 };
  const customer = await upsertCustomer(tenant, {
    name: input.customer.name,
    email: input.customer.email,
    company: input.customer.company || null,
    phone: input.customer.phone || null,
    orgNumber: orgNumber?.data ?? null,
  });
  return { ok: true, customer };
}
