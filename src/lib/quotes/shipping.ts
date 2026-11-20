import type { ShippingMethod } from "@/engine";

/** Leveranssätten namnskylt.coms egna kunder väljer mellan. */
const OWNER_METHODS: readonly ShippingMethod[] = ["standard", "parcel", "express", "pickup"];
/** En återförsäljares kund erbjuds inte upphämtningen: den pekar ut verkstadens adress. */
const RESELLER_METHODS: readonly ShippingMethod[] = ["standard", "parcel", "express"];

/**
 * Leveranssätten kunden får välja mellan när en offert godkänns. Det sätt som
 * redan står på offerten finns alltid med: har återförsäljaren satt
 * upphämtning på offerten är det ett medvetet val.
 */
export function quoteShippingMethods(owner: boolean, current: ShippingMethod): ShippingMethod[] {
  const methods = owner ? OWNER_METHODS : RESELLER_METHODS;
  return methods.includes(current) ? [...methods] : [...methods, current];
}

/**
 * Valen som visas för kunden, med sina belopp. Paketet visas bara när det är ett annat val än
 * standardfrakten, alltså när ordern annars går som varubrev, eller när det redan står på offerten.
 */
export function shownShippingOptions<T extends { method: ShippingMethod; shippingSek: number }>(options: readonly T[], current: ShippingMethod): T[] {
  const standard = options.find((option) => option.method === "standard");
  return options.filter((option) => option.method !== "parcel" || current === "parcel" || (standard !== undefined && option.shippingSek > standard.shippingSek));
}
