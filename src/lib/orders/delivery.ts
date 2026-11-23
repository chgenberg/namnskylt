import { z } from "zod";
import { SHIPPING_METHODS, type ShippingMethod } from "@/engine";

/**
 * Leveransadressen på en order. Fälten följer Skylt & Gravyrtekniks adress
 * (`Address` i skyltmotorn), så att den går rakt in på deras fraktsedel.
 */
export interface DeliveryAddress {
  /** Mottagaren på fraktsedeln: företaget, eller personen när företag saknas. */
  name: string;
  /** Personen som tar emot när mottagaren är ett företag. */
  contactName: string | null;
  line1: string;
  line2: string | null;
  /** Svenskt postnummer, skrivet `123 45`. */
  zip: string;
  city: string;
  /** Bara Sverige i dag. */
  country: "SE";
  phone: string | null;
}

/** Vem skyltarna skickas till: direkt till slutkunden eller till återförsäljaren. */
export type DeliveryTo = "customer" | "reseller";

export const DELIVERY_TO_LABEL: Record<DeliveryTo, string> = {
  customer: "Till kunden",
  reseller: "Till oss",
};

export const SHIPPING_METHOD_LABEL: Record<ShippingMethod, string> = {
  standard: "Standardfrakt",
  parcel: "Paket, DHL",
  express: "PostNord Express",
  pickup: "Hämta i Högsbo",
};

/** Det den som väljer behöver veta om varje fraktsätt. Texterna följer Skylt & Gravyrtekniks egen kassa. */
export const SHIPPING_METHOD_INFO: Record<ShippingMethod, string> = {
  standard: "PostNord varubrev eller DHL-paket, beroende på orderns storlek.",
  parcel: "Spårbart företagspaket med DHL. För den som vill ha en snabbare och säkrare leverans än varubrev.",
  express: "Priset avgörs av storlek och vikt. Fraktkostnaden tillkommer och meddelas innan ordern skickas.",
  pickup: "F O Petersons gata 28, Västra Frölunda. Mån–tor 08–17, fre 08–16. Ingen frakt.",
};

/**
 * Fraktraden på en offert eller order när frakten inte är ett belopp:
 * expressfrakten tillkommer och upphämtning kostar inget. `null` för
 * standardfrakt, som visas med sitt belopp. Texten nämner inte verkstaden,
 * eftersom raden också står på offerten som återförsäljarens kund läser.
 */
export function shippingNote(method: ShippingMethod): { label: string; value: string } | null {
  if (method === "express") return { label: "Frakt, express", value: "tillkommer" };
  if (method === "pickup") return { label: "Frakt, hämtas", value: "0 kr" };
  return null;
}

/** Fraktsättet på en leverans. En leverans sparad före valet har standardfrakt. */
export function shippingMethodOf(delivery: { method?: ShippingMethod } | null | undefined): ShippingMethod {
  return delivery?.method ?? "standard";
}

/** Längsta leveransspecifikationen, i tecken. Räcker för ett tiotal adresser med namn. */
export const DELIVERY_INSTRUCTIONS_MAX = 1000;

/** Leveransen på en order: vem som tar emot, vart och hur. */
export interface Delivery {
  to: DeliveryTo;
  address: DeliveryAddress;
  /** Saknas på leveranser sparade före valet av fraktsätt, och betyder då standardfrakt. */
  method?: ShippingMethod;
  /**
   * Leveransspecifikationen: kundens fritext om hur skyltarna ska skickas, till exempel vilka
   * namn som ska till vilken adress när de ska till flera ställen (beslut av ägaren 2026-11-23).
   * Verkstaden läser den och delar upp ordern i leveranser. Saknas när inget är skrivet.
   */
  instructions?: string | null;
}

/**
 * Leveransen på en offert. Adressen får saknas när skyltarna ska till kunden:
 * då fyller kunden i den när offerten godkänns.
 */
export interface QuoteDelivery {
  to: DeliveryTo;
  address: DeliveryAddress | null;
  method?: ShippingMethod;
  /** Leveransspecifikationen, som på ordern. Följer med när offerten blir en order. */
  instructions?: string | null;
}

/** Fälten som de skrivs i ett formulär, alla som text. */
export interface DeliveryDraft {
  name: string;
  contactName: string;
  line1: string;
  line2: string;
  zip: string;
  city: string;
  phone: string;
}

/** Förifyllda leveransadresser för de två valen: till kunden eller till återförsäljaren. */
export interface DeliveryOptions {
  customer: DeliveryDraft;
  reseller: DeliveryDraft;
}

export const EMPTY_DELIVERY_DRAFT: DeliveryDraft = { name: "", contactName: "", line1: "", line2: "", zip: "", city: "", phone: "" };

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => value || null);

/** Fem siffror, med eller utan mellanslag. Sparas som `123 45`. */
const zipSchema = z
  .string()
  .transform((value) => value.replace(/\s+/g, ""))
  .pipe(z.string().regex(/^\d{5}$/, "Postnumret ska ha fem siffror"))
  .transform((digits) => `${digits.slice(0, 3)} ${digits.slice(3)}`);

export const deliveryAddressSchema = z.object({
  name: z.string().trim().min(1, "Mottagare krävs").max(120),
  contactName: optionalText(120),
  line1: z.string().trim().min(1, "Gatuadress krävs").max(120),
  line2: optionalText(120),
  zip: zipSchema,
  city: z.string().trim().min(1, "Ort krävs").max(80),
  country: z.literal("SE").default("SE"),
  phone: optionalText(40),
}) satisfies z.ZodType<DeliveryAddress, unknown>;

const deliveryToSchema = z.enum(["customer", "reseller"]);
export const shippingMethodSchema = z.enum(SHIPPING_METHODS);

/** Leveransspecifikationen som den skrivs: tom text sparas som ingenting. */
export const deliveryInstructionsSchema = z
  .string()
  .trim()
  .max(DELIVERY_INSTRUCTIONS_MAX, `Leveransspecifikationen får vara högst ${DELIVERY_INSTRUCTIONS_MAX} tecken`)
  .nullish()
  .transform((value) => value || null);

export const deliverySchema = z.object({
  to: deliveryToSchema,
  address: deliveryAddressSchema,
  method: shippingMethodSchema.optional(),
  instructions: deliveryInstructionsSchema.optional(),
}) satisfies z.ZodType<Delivery, unknown>;

export const quoteDeliverySchema = z.object({
  to: deliveryToSchema,
  address: deliveryAddressSchema.nullable(),
  method: shippingMethodSchema.optional(),
  instructions: deliveryInstructionsSchema.optional(),
}) satisfies z.ZodType<QuoteDelivery, unknown>;

/** Leveransspecifikationen på en leverans, eller `null` när ingen är skriven. */
export function deliveryInstructionsOf(delivery: { instructions?: string | null; method?: ShippingMethod } | null | undefined): string | null {
  // En upphämtning skickas inte, så den har inga leveranser att beskriva.
  if (shippingMethodOf(delivery) === "pickup") return null;
  return delivery?.instructions?.trim() || null;
}

/**
 * Leveransen utan specifikationen, för en ny order eller offert som ärver en äldre orders leverans
 * ("Beställ igen", "Ny personal", "Beställ fler"): texten gällde de namnen, inte de nya.
 */
export function withoutInstructions<T extends { instructions?: string | null }>(delivery: T | null): T | null {
  if (!delivery || !delivery.instructions) return delivery;
  const rest = { ...delivery };
  delete rest.instructions;
  return rest;
}

/** Läser en sparad leverans. `null` när värdet saknas eller inte går att använda. */
export function parseDelivery(value: unknown): Delivery | null {
  const parsed = deliverySchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** Offertens leverans. En offert från före leveransadressen går till kunden, som fyller i adressen. */
export function parseQuoteDelivery(value: unknown): QuoteDelivery {
  const parsed = quoteDeliverySchema.safeParse(value);
  return parsed.success ? parsed.data : { to: "customer", address: null };
}

/**
 * En leverans som fraktas behöver mottagarens telefon: verkstadens fraktbokning
 * kräver den, och transportören aviserar på den (beslut av ägaren 2026-11-17).
 * Den som hämtar själv behöver ingen. En leverans utan valt fraktsätt har standardfrakt.
 */
export function needsPhone(method: ShippingMethod | undefined): boolean {
  return (method ?? "standard") !== "pickup";
}

export const PHONE_REQUIRED_TEXT = "Telefon krävs, så att transportören kan avisera leveransen";
export const PHONE_INVALID_TEXT = "Ange ett telefonnummer med riktnummer, så att transportören kan avisera leveransen";

/** Färst siffror i ett nummer som går att ringa: riktnummer och abonnentnummer. Ett streck eller "vet ej" är inget nummer. */
const PHONE_MIN_DIGITS = 7;

/**
 * Felet som ska visas när en ny leverans saknar ett telefonnummer, annars
 * `null`. Gäller det som fylls i nu. Äldre ordrar och offerter får sakna
 * telefon: då bokar verkstaden frakten för hand. Utan fraktsätt gäller
 * standardfrakt, som överallt annars.
 */
export function deliveryPhoneIssue(address: Pick<DeliveryAddress, "phone"> | null | undefined, method: ShippingMethod | undefined): string | null {
  if (!address || !needsPhone(method)) return null;
  const phone = address.phone?.trim() ?? "";
  if (!phone) return PHONE_REQUIRED_TEXT;
  return phone.replace(/\D/g, "").length < PHONE_MIN_DIGITS ? PHONE_INVALID_TEXT : null;
}

type AddressResult = { ok: true; address: DeliveryAddress } | { ok: false; error: string };

/**
 * Adressen ur ett formulär, eller felet som ska visas. Prövar inte telefonen:
 * använd `shippingAddressFromDraft` för en leverans som läggs nu.
 */
export function addressFromDraft(draft: DeliveryDraft): AddressResult {
  const parsed = deliveryAddressSchema.safeParse(draft);
  return parsed.success
    ? { ok: true, address: parsed.data }
    : { ok: false, error: parsed.error.issues[0]?.message ?? "Fyll i leveransadressen" };
}

/**
 * Adressen ur ett formulär för en leverans som läggs nu, med telefon när
 * leveransen fraktas (`deliveryPhoneIssue`). `method` är leveransens fraktsätt;
 * utan det gäller standardfrakt.
 */
export function shippingAddressFromDraft(draft: DeliveryDraft, method: ShippingMethod | undefined): AddressResult {
  const parsed = addressFromDraft(draft);
  if (!parsed.ok) return parsed;
  const phoneIssue = deliveryPhoneIssue(parsed.address, method);
  return phoneIssue ? { ok: false, error: phoneIssue } : parsed;
}

export function draftFromAddress(address: DeliveryAddress | null | undefined): DeliveryDraft {
  if (!address) return EMPTY_DELIVERY_DRAFT;
  return {
    name: address.name,
    contactName: address.contactName ?? "",
    line1: address.line1,
    line2: address.line2 ?? "",
    zip: address.zip,
    city: address.city,
    phone: address.phone ?? "",
  };
}

const ZIP_AND_CITY = /^(\d{3})\s?(\d{2})\s+(\S.*)$/;

/**
 * Gatuadress, postnummer och ort ur en adress skriven som fri text, som
 * `Storgatan 1\n111 22 Stockholm` eller `Storgatan 1, 111 22 Stockholm`.
 * Det som inte går att tolka lämnas tomt, så att den som beställer fyller i det.
 */
export function guessAddress(text: string | null | undefined): Pick<DeliveryDraft, "line1" | "line2" | "zip" | "city"> {
  const parts = (text ?? "")
    .split(/[\n,]/)
    .map((part) => part.trim())
    .filter(Boolean);
  const zipIndex = parts.findIndex((part) => ZIP_AND_CITY.test(part));
  const match = zipIndex >= 0 ? ZIP_AND_CITY.exec(parts[zipIndex] ?? "") : null;
  const street = zipIndex >= 0 ? parts.slice(0, zipIndex) : parts;
  return {
    line1: street[0] ?? "",
    line2: street.slice(1).join(", "),
    zip: match ? `${match[1]} ${match[2]}` : "",
    city: match?.[3] ?? "",
  };
}

/**
 * Ett förifyllt formulär för en mottagare: företaget som mottagare och personen
 * som kontakt, eller bara personen. Adressen tolkas ur den fria texten.
 */
export function draftForRecipient(recipient: {
  name: string;
  company?: string | null;
  phone?: string | null;
  address?: string | null;
}): DeliveryDraft {
  const company = recipient.company?.trim();
  return {
    name: company || recipient.name,
    contactName: company ? recipient.name : "",
    ...guessAddress(recipient.address),
    phone: recipient.phone ?? "",
  };
}

/** Adressen som rader, som på en fraktsedel. */
export function deliveryLines(address: DeliveryAddress): string[] {
  return [
    address.name,
    address.contactName ? `Att: ${address.contactName}` : null,
    address.line1,
    address.line2,
    `${address.zip} ${address.city}`,
    address.phone,
  ].filter((line): line is string => Boolean(line));
}
