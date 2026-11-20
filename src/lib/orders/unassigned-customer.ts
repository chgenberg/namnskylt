/**
 * Kunden på en offert som sparats som utkast, utan kund (besked via ägaren 2026-11-20: säljaren
 * ska kunna spara och ladda ner en offert utan att fylla i kundens uppgifter). En offert hör
 * alltid till en kund i databasen, så varje säljare har en platshållare som utkasten pekar på
 * tills säljaren har valt kund i panelen. Platshållaren känns igen på sin adress, som en
 * borttagen kund, och visas aldrig som en kund: den finns inte i kundlistan eller i kundvalen,
 * och offerten läses med tomma kunduppgifter (`StoredQuote.noCustomer`).
 *
 * Adressen slutar på `.invalid`, som aldrig går att mejla till.
 */
export const UNASSIGNED_CUSTOMER_EMAIL = "utan-kund@utkast.invalid";

/** Namnet på platshållarens rad, och det som står där kundens namn annars står. */
export const UNASSIGNED_CUSTOMER_NAME = "Utan kund";

export function isUnassignedCustomer(customer: { email: string }): boolean {
  return customer.email.trim().toLowerCase() === UNASSIGNED_CUSTOMER_EMAIL;
}
