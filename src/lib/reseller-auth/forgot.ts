import "server-only";
import { sendTransactional } from "@/lib/email/transactional";
import { noticeEmailSettings } from "@/lib/notices/email";
import { databaseConfigured } from "@/lib/orders/repository";
import { createAccessLink } from "./access-links";
import { accountIdByEmail } from "./accounts";
import { composeResetEmail, RESET_LINK_HOURS } from "./reset-email";

/** Sant när "Glömt lösenordet" går att använda: sajtens mejl är påslagna och det finns en databas. */
export function passwordResetAvailable(): boolean {
  return noticeEmailSettings() !== null && databaseConfigured();
}

/**
 * Mejlar en länk för att välja nytt lösenord, om adressen har ett konto. Säger
 * aldrig om adressen finns: anroparen svarar likadant i båda fallen, så att
 * formuläret inte avslöjar vilka som är kunder. Kastar aldrig.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  try {
    const settings = noticeEmailSettings();
    if (!settings || !databaseConfigured()) return;
    const address = email.trim().toLowerCase();
    const accountId = await accountIdByEmail(address);
    if (!accountId) return;
    const link = await createAccessLink({ accountId }, RESET_LINK_HOURS * 60 * 60 * 1000);
    await sendTransactional(
      composeResetEmail({
        to: address,
        url: `${settings.origin}/aterforsaljare/konto/${link.token}`,
        from: settings.from,
        replyTo: settings.replyTo,
      }),
    );
  } catch (error) {
    console.error("Länken för nytt lösenord kunde inte mejlas", error);
  }
}
