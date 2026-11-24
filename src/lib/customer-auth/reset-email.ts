import type { EmailMessage } from "@/lib/email";
import { actionsRow, brandRow, emailDocument, END_ROW, esc, headRow, noteRow, withParentLine, type EmailBrand } from "@/lib/email/layout";

/** Så länge gäller en länk som kunden själv har bett om. */
export const CUSTOMER_RESET_LINK_HOURS = 2;

/**
 * Mejlet med länken för nytt lösenord till en kund (besked av ägaren 2026-11-24: "glömt lösenord
 * saknas"). Säljaren är den kunden köpte av: namnskylt.com, eller butiken med sitt eget namn och
 * utseende, som butikens orderbekräftelse.
 */
export function composeCustomerResetEmail(input: { to: string; url: string; from: string; replyTo: string; sellerName: string; brand: EmailBrand }): EmailMessage {
  const lead = `Någon har bett om ett nytt lösenord till ditt konto hos ${input.sellerName}.`;
  const valid = `Länken gäller i ${CUSTOMER_RESET_LINK_HOURS} timmar och går att använda en gång.`;
  const ignore = "Var det inte du kan du bortse från mejlet. Lösenordet ändras inte förrän länken används.";
  return {
    from: input.from,
    to: input.to,
    replyTo: input.replyTo,
    subject: "Välj ett nytt lösenord",
    text: withParentLine([lead, "", `Välj ett nytt lösenord: ${input.url}`, "", valid, ignore].join("\n"), input.brand),
    html: emailDocument({
      title: "Välj ett nytt lösenord",
      preheader: `${lead} ${valid}`,
      rows: [
        brandRow(input.brand),
        headRow({ eyebrow: "Ditt konto", title: "Välj ett nytt lösenord", lead }),
        actionsRow([{ href: input.url, label: "Välj ett nytt lösenord" }], input.brand),
        noteRow(esc(`${valid} ${ignore}`)),
        END_ROW,
      ],
      footer: [esc(`Mejlet skickas från ${input.sellerName} när någon ber om ett nytt lösenord.`)],
      brand: input.brand,
    }),
    headers: { "Auto-Submitted": "auto-generated" },
    // Adressen är hemlig och unik per länk, så två förfrågningar ger två mejl med var sin länk.
    idempotencyKey: `customer-password-reset:${input.url.slice(-24)}`,
  };
}
