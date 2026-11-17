import type { EmailMessage } from "@/lib/email";
import { escapeHtml, fromWithName, oneLine } from "@/lib/email/transactional";
import { formatDay, formatSek } from "@/lib/format";

/**
 * Offertmejlet (beslut av ägaren 2026-11-17). Det skickas via Skylt &
 * Gravyrtekniks Resend-konto, med en egen nyckel som bara gäller offerter.
 * Avsändarens namn är säljaren, alltså återförsäljaren eller namnskylt.com,
 * och svar går till säljaren. Mejlet har knapparna Godkänn och Neka, som
 * öppnar offerten med valet förvalt: ett klick där bekräftar. En länk som
 * godkände direkt kunde läggas som order av mejlprogrammens länkskannrar.
 */

type Env = Record<string, string | undefined>;

export interface QuoteEmailSettings {
  apiKey: string;
  /** Adressen mejlet skickas från, på en domän som är bekräftad i Skylt & Gravyrtekniks Resend. */
  fromAddress: string;
  /** Bara för prov på datorn: en låtsasmottagare i stället för Resend. */
  apiUrl: string | null;
}

const ADDRESS = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;
/** Nyckeln får bara skickas till Resend, eller till en mottagare på samma dator när flödet provas. */
const LOCAL_URL = /^http:\/\/(localhost|127\.0\.0\.1):\d{2,5}\//;

/**
 * Offertmejlets strömbrytare: `QUOTE_RESEND_API_KEY` och `QUOTE_FROM_EMAIL`.
 * Utan båda skickas inget, och återförsäljaren skickar länken själv som förut.
 * Variablerna är skilda från `RESEND_API_KEY`, så att offertmejlet inte slår
 * på sajtens övriga mejl eller utskicket.
 */
export function quoteEmailSettings(env: Env = process.env): QuoteEmailSettings | null {
  const apiKey = env.QUOTE_RESEND_API_KEY?.trim();
  const fromAddress = env.QUOTE_FROM_EMAIL?.trim();
  if (!apiKey || !fromAddress || !ADDRESS.test(fromAddress)) return null;
  const apiUrl = env.QUOTE_RESEND_API_URL?.trim() || null;
  // En adress som inte duger stänger av mejlet. Annars gick ett prov på datorn, med en felskriven
  // adress och en riktig nyckel, till riktiga Resend och blev ett riktigt mejl.
  if (apiUrl && !LOCAL_URL.test(apiUrl)) return null;
  return { apiKey, fromAddress, apiUrl };
}

/** Svaret i länken från mejlet: `?svar=godkann` eller `?svar=neka`. */
export const QUOTE_ANSWER_PARAM = "svar";
export type QuoteAnswer = "accept" | "decline";
const ANSWER_VALUES: Record<QuoteAnswer, string> = { accept: "godkann", decline: "neka" };

/** Valet mottagaren gjorde i mejlet, läst ur adressen. Allt annat än de två värdena betyder inget val. */
export function quoteAnswerOf(value: string | string[] | undefined): QuoteAnswer | null {
  const text = Array.isArray(value) ? value[0] : value;
  if (text === ANSWER_VALUES.accept) return "accept";
  return text === ANSWER_VALUES.decline ? "decline" : null;
}

/** Det mejlet behöver veta om offerten. Bara det kunden betalar, aldrig inköpspriser. */
export interface QuoteMail {
  quoteNo: string;
  project: string | null;
  customerName: string;
  customerEmail: string;
  /** Antal skyltar i offerten. */
  quantity: number;
  totalSek: number;
  totalInclVatSek: number;
  /** Expressfraktens pris sätts i efterhand och är inte med i summan. */
  shippingPending: boolean;
  /** Sista giltiga dag, `YYYY-MM-DD`. */
  validUntil: string;
  /** Säljarens egna ord till kunden. */
  message: string | null;
  /** Adressen till kundens offertsida, utan frågedel. */
  url: string;
  /** När offerten skickades. Ett nytt utskick av samma offert är ett nytt mejl. */
  sentAt: string;
}

export interface QuoteMailSender {
  /** Säljaren kunden får offerten av: återförsäljaren eller namnskylt.com. */
  sellerName: string;
  /** Dit kundens svar går. */
  replyTo: string;
  fromAddress: string;
  /** Säljarens uppgifter under mejlet, som på offerten. */
  footer: readonly string[];
}

const BUTTON = "display:inline-block;padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:600;font-size:15px";

/** Offertmejlet till kunden: vad offerten gäller, vad den kostar och knapparna Godkänn och Neka. */
export function composeQuoteEmail(quote: QuoteMail, sender: QuoteMailSender): EmailMessage {
  const seller = oneLine(sender.sellerName);
  const firstName = oneLine(quote.customerName).split(" ")[0] ?? "";
  const accept = `${quote.url}?${QUOTE_ANSWER_PARAM}=${ANSWER_VALUES.accept}`;
  const decline = `${quote.url}?${QUOTE_ANSWER_PARAM}=${ANSWER_VALUES.decline}`;
  const plus = quote.shippingPending ? " + frakt" : "";
  const intro = `Här är offerten på ${quote.quantity === 1 ? "en namnskylt" : `${quote.quantity} namnskyltar`} från ${seller}.`;
  const rows: [string, string][] = [
    ["Offert", quote.project ? `${quote.quoteNo}, ${oneLine(quote.project)}` : quote.quoteNo],
    ["Summa exkl. moms", `${formatSek(quote.totalSek)}${plus}`],
    ["Summa inkl. moms", `${formatSek(quote.totalInclVatSek)}${plus}`],
    ["Giltig till och med", formatDay(`${quote.validUntil}T12:00:00Z`)],
  ];
  const message = quote.message?.trim() ?? "";
  const how = "Knapparna öppnar offerten, där du ser skyltarna och bekräftar ditt val med ett klick.";
  const text = [
    `Hej ${firstName},`,
    "",
    intro,
    ...(message ? ["", message] : []),
    "",
    ...rows.map(([label, value]) => `${label}: ${value}`),
    "",
    `Godkänn offerten: ${accept}`,
    `Neka offerten: ${decline}`,
    `Se offerten: ${quote.url}`,
    "",
    how,
    "",
    "Vänliga hälsningar",
    ...sender.footer,
  ].join("\n");
  const cell = "padding:4px 16px 4px 0";
  const html = [
    `<p>Hej ${escapeHtml(firstName)},</p>`,
    `<p>${escapeHtml(intro)}</p>`,
    message ? `<p style="white-space:pre-line">${escapeHtml(message)}</p>` : null,
    `<table style="border-collapse:collapse">${rows
      .map(([label, value]) => `<tr><td style="${cell};color:#666666">${escapeHtml(label)}</td><td style="${cell}"><strong>${escapeHtml(value)}</strong></td></tr>`)
      .join("")}</table>`,
    `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 8px"><tr>` +
      `<td><a href="${escapeHtml(accept)}" style="${BUTTON};background:#0a0a0b;color:#ffffff;border:1px solid #0a0a0b">Godkänn offerten</a></td>` +
      `<td style="width:12px"></td>` +
      `<td><a href="${escapeHtml(decline)}" style="${BUTTON};background:#ffffff;color:#0a0a0b;border:1px solid #c9c7c0">Neka offerten</a></td>` +
      `</tr></table>`,
    `<p style="color:#666666;font-size:13px">${escapeHtml(how)} <a href="${escapeHtml(quote.url)}">Se offerten</a></p>`,
    `<p>Vänliga hälsningar<br>${sender.footer.map((line) => escapeHtml(oneLine(line))).join("<br>")}</p>`,
  ]
    .filter((part) => part !== null)
    .join("\n");
  return {
    from: fromWithName(seller, sender.fromAddress),
    to: quote.customerEmail,
    replyTo: sender.replyTo,
    subject: oneLine(`Offert ${quote.quoteNo} från ${seller}`),
    html,
    text,
    headers: { "Auto-Submitted": "auto-generated" },
    // Samma utskick ger aldrig två mejl. Skickas offerten igen är det ett nytt utskick.
    idempotencyKey: `quote:${quote.quoteNo}:${quote.sentAt}`,
  };
}
