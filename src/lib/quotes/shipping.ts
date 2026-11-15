import type { ShippingMethod } from "@/engine";

/** Leveranssätten namnskylt.coms egna kunder väljer mellan. */
const OWNER_METHODS: readonly ShippingMethod[] = ["standard", "express", "pickup"];
/** En återförsäljares kund erbjuds inte upphämtningen: den pekar ut verkstadens adress. */
const RESELLER_METHODS: readonly ShippingMethod[] = ["standard", "express"];

/**
 * Leveranssätten kunden får välja mellan när en offert godkänns. Det sätt som
 * redan står på offerten finns alltid med: har återförsäljaren satt
 * upphämtning på offerten är det ett medvetet val.
 */
export function quoteShippingMethods(owner: boolean, current: ShippingMethod): ShippingMethod[] {
  const methods = owner ? OWNER_METHODS : RESELLER_METHODS;
  return methods.includes(current) ? [...methods] : [...methods, current];
}
