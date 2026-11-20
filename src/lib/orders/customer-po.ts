import { z } from "zod";

/**
 * Beställarens eget inköpsnummer (besked av ägaren 2026-11-20: "en kund oavsett ÅF eller
 * slutkund kommer vilja kunna lägga in eget inköpsnummer"). Det är numret på kundens egen
 * inköpsorder, som kunden vill se igen på sin faktura. Fältet är frivilligt och fri text: varje
 * företag har sin egen form på numret.
 *
 * Den som lägger ordern fyller i det: kunden i kassan, säljaren i varukorgen eller offertvyn,
 * eller kunden när en offert godkänns. Numret följer med från offert till order, och till
 * verkstaden, som fakturerar.
 */
export const CUSTOMER_PO_MAX = 40;

/** Fältets namn i formulär och på dokument. */
export const CUSTOMER_PO_LABEL = "Inköpsnummer";

/** Numret som det sparas: en rad, utan luft i kanterna. `null` när inget är ifyllt. */
export function cleanCustomerPo(value: string | null | undefined): string | null {
  const text = (value ?? "").replace(/\s+/g, " ").trim().slice(0, CUSTOMER_PO_MAX);
  return text || null;
}

/** Fältet i ett anrop. Tomt och utelämnat är samma sak. */
export const customerPoSchema = z.string().trim().max(CUSTOMER_PO_MAX, `Inköpsnumret får ha högst ${CUSTOMER_PO_MAX} tecken`).optional();
