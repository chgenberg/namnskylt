import type { EmailMessage } from "@/lib/email";
import { escapeHtml } from "@/lib/email/transactional";

/** Så länge gäller länken i mejlet. Kort, eftersom den går till en brevlåda och inte lämnas över av en människa. */
export const RESET_LINK_HOURS = 2;

/** Mejlet till den som har glömt sitt lösenord: en länk där ett nytt väljs. Länken gäller en gång. */
export function composeResetEmail(input: { to: string; url: string; from: string; replyTo: string }): EmailMessage {
  const lead = "Någon har bett om ett nytt lösenord till ditt konto på namnskylt.com.";
  const valid = `Länken gäller i ${RESET_LINK_HOURS} timmar och går att använda en gång.`;
  const ignore = "Var det inte du kan du bortse från mejlet. Lösenordet ändras inte förrän länken används.";
  return {
    from: input.from,
    to: input.to,
    replyTo: input.replyTo,
    subject: "Välj ett nytt lösenord",
    text: [lead, "", `Välj ett nytt lösenord: ${input.url}`, "", valid, ignore].join("\n"),
    html: [
      `<p>${escapeHtml(lead)}</p>`,
      `<p><a href="${escapeHtml(input.url)}">Välj ett nytt lösenord</a></p>`,
      `<p style="color:#666;font-size:13px">${escapeHtml(valid)} ${escapeHtml(ignore)}</p>`,
    ].join("\n"),
    headers: { "Auto-Submitted": "auto-generated" },
    // Adressen är hemlig och unik per länk, så två förfrågningar ger två mejl med var sin länk.
    idempotencyKey: `password-reset:${input.url.slice(-24)}`,
  };
}
