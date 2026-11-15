import { z } from "zod";

/** Svenskt organisationsnummer: tio siffror, med eller utan bindestreck. Sparas som `556123-4567`. */
export const orgNumberSchema = z
  .string()
  .transform((value) => value.replace(/[\s-]/g, ""))
  .pipe(z.string().regex(/^\d{10}$/, "Organisationsnumret ska ha tio siffror"))
  .transform((digits) => `${digits.slice(0, 6)}-${digits.slice(6)}`);
