import { z } from "zod";

/**
 * En förfrågan om att bli uppringd, från sidan med filmen (besked av ägaren 2026-11-25: "Då anger man
 * bara sitt namn och sitt telefonnummer och trycker på skicka"). Inget annat frågas efter.
 */

/** Siffrorna i ett nummer, med +46 som 0. */
export function phoneDigits(value: string): string {
  const digits = value.replace(/[^\d+]/g, "");
  return digits.startsWith("+46") ? `0${digits.slice(3)}` : digits.replace(/\+/g, "");
}

export const callbackRequestSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Skriv ditt namn")
    .max(80, "Namnet får vara högst 80 tecken")
    .refine((value) => !/[<>\r\n]/.test(value), "Namnet får inte innehålla tecknen < och >"),
  phone: z
    .string()
    .trim()
    .max(30, "Numret får vara högst 30 tecken")
    .refine((value) => /^[\d\s+()\-]+$/.test(value), "Skriv bara siffror i numret")
    .refine((value) => {
      const digits = phoneDigits(value);
      return digits.length >= 7 && digits.length <= 15;
    }, "Skriv ett telefonnummer med riktnummer"),
  /** Länkkoden från utskicksmejlet, om besökaren kom därifrån. */
  k: z.string().trim().max(200).optional(),
});

export type CallbackRequest = z.infer<typeof callbackRequestSchema>;
