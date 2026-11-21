import type { EmailMessage } from "@/lib/email";
import { actionsRow, brandRow, emailDocument, END_ROW, esc, headRow, quoteRow, siteBrand, withParentLine } from "@/lib/email/layout";
import { noticeView, type PanelNotice } from "./model";

type Env = Record<string, string | undefined>;

export interface NoticeEmailSettings {
  /** Nyckeln som bara gäller de här mejlen. Den går aldrig någon annanstans än till Resend. */
  apiKey: string;
  /** Avsändaren som den står i mejlet, `Namn <adress>` eller bara adressen. */
  from: string;
  /** Adressen som svar går till: avsändarens adress utan namn. */
  replyTo: string;
  /** Sajtens adress, som länken i mejlet byggs på. */
  origin: string;
  /** Bara för prov på datorn: en låtsasmottagare i stället för Resend. */
  apiUrl: string | null;
}

const DEFAULT_ORIGIN = "https://www.namnskylt.com";
const ADDRESS = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
/** Låtsasmottagaren för prov får bara ligga på samma dator. */
const LOCAL_URL = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//;

/**
 * Strömbrytaren för sajtens mejl till återförsäljare och till butikernas kunder (beslut av ägaren
 * 2026-11-21): besked till en återförsäljares panel, länken för den som har glömt sitt lösenord,
 * och orderbekräftelsen och fraktbeskedet till en kund som har beställt i en återförsäljares
 * butik. Båda krävs: `NOTICE_RESEND_API_KEY` och avsändaren i `NOTICE_FROM_EMAIL`.
 *
 * Den är skild från `RESEND_API_KEY`, som bara gäller utskicket till återförsäljare: med de här
 * mejlen på skickar utskicket fortfarande ingenting, och tvärtom. Förut delade de nyckel, så att
 * mejlen inte gick att slå på utan att utskicket fick sin sändare. Nödstoppet
 * `OUTREACH_DISABLED=true` stänger av även det här. Annars `null`, och beskeden syns bara i panelen.
 */
export function noticeEmailSettings(env: Env = process.env): NoticeEmailSettings | null {
  if (env.OUTREACH_DISABLED === "true") return null;
  const apiKey = env.NOTICE_RESEND_API_KEY?.trim();
  const from = env.NOTICE_FROM_EMAIL?.trim();
  if (!apiKey || !from) return null;
  const replyTo = (/<([^<>]+)>\s*$/.exec(from)?.[1] ?? from).trim();
  if (!ADDRESS.test(replyTo)) return null;
  const origin = (env.NOTICE_PUBLIC_URL?.trim() || DEFAULT_ORIGIN).replace(/\/+$/, "");
  if (!/^https?:\/\//.test(origin)) return null;
  const apiUrl = env.NOTICE_RESEND_API_URL?.trim() || null;
  // En adress som inte duger stänger av mejlet, så att ett prov med felskriven adress aldrig blir ett riktigt mejl.
  if (apiUrl && !LOCAL_URL.test(apiUrl)) return null;
  return { apiKey, from, replyTo, origin, apiUrl };
}

export interface AdminNoticeEmailSettings extends NoticeEmailSettings {
  /** Dit adminens besked mejlas: en eller flera adresser, var och en får sitt eget mejl. */
  recipients: string[];
}

/** Så många mottagare får stå i `ADMIN_NOTICE_TO`. Fler är ett skrivfel, inte en sändlista. */
const ADMIN_RECIPIENTS_MAX = 5;

/**
 * Strömbrytaren för adminens besked som mejl (besked av ägaren 2026-11-20: när ett företag ansöker
 * om att bli återförsäljare ska ett mejl gå till adminens adresser, och likaså beskeden om ordrar).
 * Den har sin egen nyckel, som offertmejlets: med den på mejlas bara beskeden till namnskylt.coms
 * egen panel, till adresserna i `ADMIN_NOTICE_TO`. Återförsäljarnas besked, lösenordslänken och
 * butikskundernas mejl har sin strömbrytare (`noticeEmailSettings`), och utskicket sin.
 *
 * Alla tre krävs: `ADMIN_NOTICE_RESEND_API_KEY`, `ADMIN_NOTICE_FROM_EMAIL` och `ADMIN_NOTICE_TO`
 * (adresser med komma emellan). Mottagarna står i miljön, aldrig i koden. Nödstoppet
 * `OUTREACH_DISABLED=true` stänger av även det här.
 */
export function adminNoticeEmailSettings(env: Env = process.env): AdminNoticeEmailSettings | null {
  if (env.OUTREACH_DISABLED === "true") return null;
  const apiKey = env.ADMIN_NOTICE_RESEND_API_KEY?.trim();
  const from = env.ADMIN_NOTICE_FROM_EMAIL?.trim();
  if (!apiKey || !from) return null;
  const replyTo = (/<([^<>]+)>\s*$/.exec(from)?.[1] ?? from).trim();
  if (!ADDRESS.test(replyTo)) return null;
  const listed = (env.ADMIN_NOTICE_TO ?? "").split(/[,;\s]+/).map((address) => address.trim().toLowerCase()).filter(Boolean);
  const recipients = [...new Set(listed)];
  // En adress som inte går att läsa stänger av mejlet, hellre än att beskeden går till en del av mottagarna.
  if (recipients.length === 0 || recipients.length > ADMIN_RECIPIENTS_MAX || !recipients.every((address) => ADDRESS.test(address))) return null;
  const origin = (env.NOTICE_PUBLIC_URL?.trim() || DEFAULT_ORIGIN).replace(/\/+$/, "");
  if (!/^https?:\/\//.test(origin)) return null;
  const apiUrl = env.ADMIN_NOTICE_RESEND_API_URL?.trim() || null;
  // En adress som inte duger stänger av mejlet, så att ett prov med felskriven adress aldrig blir ett riktigt mejl.
  if (apiUrl && !LOCAL_URL.test(apiUrl)) return null;
  return { apiKey, from, replyTo, origin, recipients, apiUrl };
}

/** Rubriken får inga radbrytningar, så att kundens namn aldrig kan lägga till huvuden i mejlet. */
const oneLine = (value: string) => value.replace(/\s+/g, " ").trim();

const FOOTER = "Beskedet skickas från panelen på namnskylt.com när något nytt har hänt där.";

/** Mejlet om ett besked: samma mening som i panelen, kundens egna ord och en länk dit. */
export function composeNoticeEmail(notice: PanelNotice, to: string, settings: Pick<NoticeEmailSettings, "from" | "replyTo" | "origin">): EmailMessage {
  const view = noticeView(notice);
  const title = oneLine(view.title);
  const url = `${settings.origin}${view.href}`;
  const detail = view.detail?.trim() || null;
  const text = [`${title}.`, detail, "", `Öppna i panelen: ${url}`, "", FOOTER].filter((line) => line !== null).join("\n");
  const brand = siteBrand(settings.origin);
  const html = emailDocument({
    title,
    preheader: detail ?? "Öppna beskedet i panelen.",
    rows: [
      brandRow(brand),
      headRow({ eyebrow: "Besked från panelen", title: `${title}.` }),
      detail ? quoteRow(detail) : null,
      actionsRow([{ href: url, label: "Öppna i panelen" }], brand),
      END_ROW,
    ].filter((part) => part !== null),
    footer: [esc(FOOTER)],
    brand,
  });
  return {
    from: settings.from,
    to,
    replyTo: settings.replyTo,
    subject: title,
    html,
    text: withParentLine(text, brand),
    headers: { "Auto-Submitted": "auto-generated" },
    // Samma besked ger aldrig två mejl, även om utskicket skulle göras om.
    idempotencyKey: `notice:${notice.id}`,
  };
}
