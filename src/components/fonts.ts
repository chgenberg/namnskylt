import { Instrument_Serif } from "next/font/google";

/** Redaktionell rubrik på startsidan; resten av sajten är Geist. */
export const editorialSerif = Instrument_Serif({
  subsets: ["latin", "latin-ext"],
  weight: "400",
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-editorial",
});
