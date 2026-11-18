import { emailMode, isRealEmailSend, type EmailMessage } from "./index";
import { ResendEmailSender } from "./resend-sender";

/** Ämnesrader och namn får inga radbrytningar, så att ett namn aldrig kan lägga till huvuden i mejlet. */
export const oneLine = (value: string) => value.replace(/\s+/g, " ").trim();

/** Avsändaren med ett annat visningsnamn men samma adress, till exempel butikens namn. */
export function fromWithName(name: string, address: string): string {
  const clean = oneLine(name).replace(/["<>\\]/g, "");
  return clean ? `"${clean}" <${address}>` : address;
}

/**
 * Skickar ett av sajtens egna mejl (orderbekräftelse, nytt lösenord). `true`
 * bara när Resend verkligen har tagit emot det. Utan `RESEND_API_KEY`, eller
 * med nödstoppet på, lämnar inget mejl servern. Kastar aldrig.
 */
export async function sendTransactional(message: EmailMessage): Promise<boolean> {
  if (emailMode() !== "live") return false;
  try {
    const result = await new ResendEmailSender(process.env.RESEND_API_KEY?.trim() ?? "").send(message);
    if (isRealEmailSend(result)) return true;
    console.error("Mejlet kunde inte skickas", result.status, result.error);
  } catch (error) {
    console.error("Mejlet kunde inte skickas", error);
  }
  return false;
}
