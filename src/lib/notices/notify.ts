import "server-only";
import { isRealEmailSend } from "@/lib/email";
import { ResendEmailSender, type FetchLike } from "@/lib/email/resend-sender";
import { databaseConfigured, getCompanyProfile } from "@/lib/orders/repository";
import { accountEmail } from "@/lib/reseller-auth/accounts";
import { isOwner } from "@/lib/tenants/model";
import { adminNoticeEmailSettings, composeNoticeEmail, noticeEmailSettings, type AdminNoticeEmailSettings } from "./email";
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

/**
 * Adminens besked till adminens adresser, ett mejl per mottagare. `true` när minst ett mejl gick iväg.
 * Varje mottagare har sin egen nyckel hos Resend: med samma nyckel hade det andra mejlet räknats som
 * en upprepning av det första och aldrig skickats.
 */
export async function emailAdminNotice(notice: PanelNotice, settings: AdminNoticeEmailSettings, fetchImpl?: FetchLike): Promise<boolean> {
  // På datorn kan en låtsasmottagare stå i stället för Resend, så att flödet går att prova utan att mejla någon.
  const target: FetchLike | undefined = settings.apiUrl ? (_url, init) => fetch(settings.apiUrl as string, init) : fetchImpl;
  const sender = new ResendEmailSender(settings.apiKey, target);
  let sent = false;
  for (const to of settings.recipients) {
    const message = composeNoticeEmail(notice, to, settings);
    const result = await sender.send({ ...message, idempotencyKey: `${message.idempotencyKey}:${to}` });
    if (isRealEmailSend(result)) sent = true;
    else console.error("Adminens besked kunde inte mejlas", result.status, result.error);
  }
  return sent;
}

async function emailNotice(tenant: string, notice: PanelNotice): Promise<void> {
  try {
    // namnskylt.coms egna besked har sin egen strömbrytare och sina egna mottagare.
    const admin = isOwner(tenant) ? adminNoticeEmailSettings() : null;
    if (admin) {
      if (await emailAdminNotice(notice, admin)) await markNoticeEmailed(notice.id);
      return;
    }
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
