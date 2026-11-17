import { z } from "zod";

/** Svenskt organisationsnummer: tio siffror, med eller utan bindestreck. Sparas som `556123-4567`. */
export const orgNumberSchema = z
  .string()
  .transform((value) => value.replace(/[\s-]/g, ""))
  .pipe(z.string().regex(/^\d{10}$/, "Organisationsnumret ska ha tio siffror"))
  .transform((digits) => `${digits.slice(0, 6)}-${digits.slice(6)}`);

/**
 * Organisationsnumrets tio siffror, eller `null` när texten inte är ett nummer.
 * Läser också ett momsnummer (`SE` + tio siffror + `01`) och ett nummer med
 * sekel (tolv siffror). Regeln är verkstadens egen (deras `orgDigits`): det
 * här är vad mottagaren godtar som beställarens nummer.
 */
export function orgNumberDigits(value: string | null | undefined): string | null {
  const text = (value ?? "").trim();
  const digits = text.replace(/\D/g, "");
  const ten = /^se/i.test(text) && digits.length === 12 && digits.endsWith("01") ? digits.slice(0, 10) : digits.length === 12 ? digits.slice(2) : digits;
  return ten.length === 10 ? ten : null;
}
