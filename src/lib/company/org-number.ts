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

/**
 * Numret som det sparas, `556123-4567`, när texten går att läsa som ett organisationsnummer.
 * Annars texten som den skrevs, och `null` när den är tom: fältet är fritt där numret inte krävs.
 */
export function formattedOrgNumber(value: string | null | undefined): string | null {
  const text = (value ?? "").trim();
  if (!text) return null;
  const digits = orgNumberDigits(text);
  return digits ? `${digits.slice(0, 6)}-${digits.slice(6)}` : text;
}
