import "server-only";
import { isErasedCustomer } from "./erase-model";
import { listCustomerChoices } from "./repository";

/** En kund i kundvalet: företaget (eller personen), raden under med kontaktperson och e-post, och om kunden är demo. */
export interface CustomerChoiceRow {
  id: string;
  label: string;
  detail: string;
  email: string;
  demo?: boolean;
}

/**
 * Säljarens kunder som de visas i kundvalet: i skyltmotorns varukorg och offertvy, och när ett
 * utkast utan kund får sin kund i panelen. Borttagna kunder är inte med.
 */
export async function customerChoiceRows(tenant: string): Promise<CustomerChoiceRow[]> {
  return (await listCustomerChoices(tenant))
    .filter((choice) => !isErasedCustomer(choice))
    .map((choice) => ({
      id: choice.id,
      label: choice.company ?? choice.name,
      // En kund som sparats med bara företagets namn har det som namn också, och ingen e-post.
      detail: [choice.company && choice.name !== choice.company ? choice.name : null, choice.email].filter(Boolean).join(" · "),
      email: choice.email,
      ...(choice.demo && { demo: true }),
    }));
}
