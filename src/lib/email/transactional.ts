import { isRealEmailSend, type EmailMessage } from "./index";
import { ResendEmailSender, type FetchLike } from "./resend-sender";

/** Ämnesrader och namn får inga radbrytningar, så att ett namn aldrig kan lägga till huvuden i mejlet. */
export const oneLine = (value: string) => value.replace(/\s+/g, " ").trim();

/** Avsändaren med ett annat visningsnamn men samma adress, till exempel butikens namn. */
export function fromWithName(name: string, address: string): string {
  const clean = oneLine(name).replace(/["<>\\]/g, "");
  return clean ? `"${clean}" <${address}>` : address;
}

/** Nyckeln mejlet skickas med, ur mejlens egen strömbrytare (`noticeEmailSettings`). */
export interface TransactionalKey {
  apiKey: string;
  /** Bara för prov på datorn: en låtsasmottagare i stället för Resend. */
  apiUrl?: string | null;
}

/**
 * Skickar ett av sajtens egna mejl (besked, nytt lösenord, butikens orderbekräftelse). `true`
 * bara när Resend verkligen har tagit emot det. Anroparen läser strömbrytaren och lämnar dess
 * nyckel: utan den anropas den här aldrig, och utskickets nyckel används aldrig här. Kastar aldrig.
 */
export async function sendTransactional(message: EmailMessage, key: TransactionalKey): Promise<boolean> {
  try {
    // På datorn kan en låtsasmottagare stå i stället för Resend, så att flödet går att prova utan att mejla någon.
    const target: FetchLike | undefined = key.apiUrl ? (_url, init) => fetch(key.apiUrl as string, init) : undefined;
    const result = await new ResendEmailSender(key.apiKey, target).send(message);
    if (isRealEmailSend(result)) return true;
    console.error("Mejlet kunde inte skickas", result.status, result.error);
  } catch (error) {
    console.error("Mejlet kunde inte skickas", error);
  }
  return false;
}
