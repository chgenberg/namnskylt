import "server-only";
import { addressFromDraft, draftForRecipient, draftFromAddress, type DeliveryOptions, type QuoteDelivery } from "./delivery";
import type { Customer } from "./model";
import { getCompanyProfile, getResellerDeliveryAddress, latestCustomerDelivery } from "./repository";

/**
 * Kundens adress är den som senast användes för kunden, annars det som går att
 * tolka ur kundens uppgifter. Återförsäljarens är den sparade leveransadressen,
 * annars företagets uppgifter.
 */
export async function deliveryOptions(tenant: string, customer: Customer): Promise<DeliveryOptions> {
  const [lastUsed, saved, company] = await Promise.all([
    latestCustomerDelivery(tenant, customer.id),
    getResellerDeliveryAddress(tenant),
    getCompanyProfile(tenant),
  ]);
  return {
    customer: lastUsed ? draftFromAddress(lastUsed) : draftForRecipient(customer),
    reseller: saved ? draftFromAddress(saved) : draftForRecipient({ name: company.name, phone: company.phone, address: company.address }),
  };
}

/**
 * Leveransen en ny offert börjar med: till kunden, med adressen ifylld när den
 * redan är känd. Annars fyller kunden i den när offerten godkänns.
 */
export async function defaultQuoteDelivery(tenant: string, customer: Customer): Promise<QuoteDelivery> {
  const draft = (await deliveryOptions(tenant, customer)).customer;
  const parsed = addressFromDraft(draft);
  return { to: "customer", address: parsed.ok ? parsed.address : null };
}
