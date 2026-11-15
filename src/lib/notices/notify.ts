import "server-only";
import { isRealEmailSend } from "@/lib/email";
import { ResendEmailSender } from "@/lib/email/resend-sender";
import { databaseConfigured, getCompanyProfile } from "@/lib/orders/repository";
import { accountEmail } from "@/lib/reseller-auth/accounts";
import { isOwner } from "@/lib/tenants/model";
import { composeNoticeEmail, noticeEmailSettings } from "./email";
import type { PanelNotice } from "./model";
import { insertNotice, markNoticeEmailed, type NewNotice } from "./repository";

/**
 * Säger till den som äger panelen att någon annan har gjort något. Beskedet
 * sparas och syns i panelen; är mejl om besked påslaget går det också som mejl.
 * Kastar aldrig: kundens svar är redan sparat, och ett besked som inte går att
 * spara får inte ge kunden ett fel.
 */
export async function notify(input: NewNotice): Promise<void> {
  if (!databaseConfigured()) return;
  try {
    const notice = await insertNotice(input);
    // Mejlet väntar kunden inte på.
    if (notice) void emailNotice(input.tenant, notice);
  } catch (error) {
    console.error("Beskedet kunde inte sparas", error);
  }
}

/** Dit beskedet mejlas: adressen i företagets uppgifter, annars adressen kontot loggar in med. */
async function recipientFor(tenant: string): Promise<string | null> {
  const company = await getCompanyProfile(tenant);
  if (company.email) return company.email;
  return isOwner(tenant) ? null : accountEmail(tenant);
}

async function emailNotice(tenant: string, notice: PanelNotice): Promise<void> {
  try {
    const settings = noticeEmailSettings();
    if (!settings) return;
    const to = await recipientFor(tenant);
    if (!to) return;
    const sender = new ResendEmailSender(process.env.RESEND_API_KEY?.trim() ?? "");
    const result = await sender.send(composeNoticeEmail(notice, to, settings));
    if (isRealEmailSend(result)) await markNoticeEmailed(notice.id);
    else console.error("Beskedet kunde inte mejlas", result.status, result.error);
  } catch (error) {
    console.error("Beskedet kunde inte mejlas", error);
  }
}
