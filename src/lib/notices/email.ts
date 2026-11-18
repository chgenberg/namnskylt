import { emailMode, type EmailMessage } from "@/lib/email";
import { actionsRow, brandRow, emailDocument, END_ROW, esc, headRow, quoteRow, siteBrand } from "@/lib/email/layout";
import { noticeView, type PanelNotice } from "./model";

type Env = Record<string, string | undefined>;

export interface NoticeEmailSettings {
  /** Avsändaren som den står i mejlet, `Namn <adress>` eller bara adressen. */
  from: string;
  /** Adressen som svar går till: avsändarens adress utan namn. */
  replyTo: string;
  /** Sajtens adress, som länken i mejlet byggs på. */
  origin: string;
}

const DEFAULT_ORIGIN = "https://www.namnskylt.com";
const ADDRESS = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

/**
 * Strömbrytaren för mejl om besked. Mejl skickas bara när Resend är inkopplat
 * (`RESEND_API_KEY`, utan nödstoppet) och avsändaren är satt i
 * `NOTICE_FROM_EMAIL`. Annars `null`, och beskeden syns bara i panelen.
 */
export function noticeEmailSettings(env: Env = process.env): NoticeEmailSettings | null {
  if (emailMode(env) !== "live") return null;
  const from = env.NOTICE_FROM_EMAIL?.trim();
  if (!from) return null;
  const replyTo = (/<([^<>]+)>\s*$/.exec(from)?.[1] ?? from).trim();
  if (!ADDRESS.test(replyTo)) return null;
  const origin = (env.NOTICE_PUBLIC_URL?.trim() || DEFAULT_ORIGIN).replace(/\/+$/, "");
  if (!/^https?:\/\//.test(origin)) return null;
  return { from, replyTo, origin };
}

/** Rubriken får inga radbrytningar, så att kundens namn aldrig kan lägga till huvuden i mejlet. */
const oneLine = (value: string) => value.replace(/\s+/g, " ").trim();

const FOOTER = "Beskedet skickas från panelen på namnskylt.com när en kund svarar eller beställer.";

/** Mejlet om ett besked: samma mening som i panelen, kundens egna ord och en länk dit. */
export function composeNoticeEmail(notice: PanelNotice, to: string, settings: NoticeEmailSettings): EmailMessage {
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
  });
  return {
    from: settings.from,
    to,
    replyTo: settings.replyTo,
    subject: title,
    html,
    text,
    headers: { "Auto-Submitted": "auto-generated" },
    // Samma besked ger aldrig två mejl, även om utskicket skulle göras om.
    idempotencyKey: `notice:${notice.id}`,
  };
}
