import { engravedRows, getColor, getMaterial, type BadgeDocument } from "@/engine";
import type { EmailMessage } from "@/lib/email";
import {
  actionsRow,
  brandRow,
  emailDocument,
  END_ROW,
  esc,
  factsRow,
  footerLines,
  headRow,
  nameBrand,
  noteLink,
  noteRow,
  pictureRow,
  quoteRow,
  signatureRow,
  type EmailBrand,
} from "@/lib/email/layout";
import { fromWithName, oneLine } from "@/lib/email/transactional";
import { formatDay, formatSek } from "@/lib/format";

/**
 * Offertmejlet (beslut av ägaren 2026-11-17). Det skickas via Skylt &
 * Gravyrtekniks Resend-konto, med en egen nyckel som bara gäller offerter.
 * Avsändarens namn är säljaren, alltså återförsäljaren eller, hos namnskylt.com,
 * Skylt & Gravyrteknik (`getSellerProfile`), och svar går till säljaren. Mejlet har knapparna Godkänn och Neka, som
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
  /** Bilden av offertens första skylt, på en adress som e-postklienten når utan inloggning. Utan den visas ingen bild. */
  picture?: { url: string; caption: string } | null;
}

/** Måtten skyltens bild visas i. Filen är dubbelt så stor (`renderMailBadge`). */
export const QUOTE_PICTURE = { width: 528, height: 264 };

/** Raden under bilden: vad som står på skylten, vad den är gjord av och hur stor den är. */
export function quotePictureCaption(badges: readonly BadgeDocument[]): string {
  const first = badges[0];
  if (!first) return "";
  const text = engravedRows(first)
    .map((row) => row.text.trim())
    .filter(Boolean)
    .join(", ");
  const more = badges.length - 1;
  return [
    text || "Utan text",
    `${getMaterial(first.materialId).name}, ${getColor(first.materialId, first.colorId).name}`,
    `${first.size.widthMm} × ${first.size.heightMm} mm`,
    ...(more > 0 ? [`och ${more} till`] : []),
  ].join(" · ");
}

export interface QuoteMailSender {
  /** Säljaren kunden får offerten av: återförsäljaren, eller Skylt & Gravyrteknik hos namnskylt.com. */
  sellerName: string;
  /** Dit kundens svar går. */
  replyTo: string;
  fromAddress: string;
  /** Säljarens uppgifter under mejlet, som på offerten. */
  footer: readonly string[];
  /** Säljarens logga och färg överst i mejlet. Utelämnad = namnet som ordmärke. */
  brand?: EmailBrand;
}

/** Offertmejlet till kunden: vad offerten gäller, vad den kostar och knapparna Godkänn och Neka. */
export function composeQuoteEmail(quote: QuoteMail, sender: QuoteMailSender): EmailMessage {
  const seller = oneLine(sender.sellerName);
  const brand = sender.brand ?? nameBrand(seller);
  const firstName = oneLine(quote.customerName).split(" ")[0] ?? "";
  const accept = `${quote.url}?${QUOTE_ANSWER_PARAM}=${ANSWER_VALUES.accept}`;
  const decline = `${quote.url}?${QUOTE_ANSWER_PARAM}=${ANSWER_VALUES.decline}`;
  const plus = quote.shippingPending ? " + frakt" : "";
  const count = quote.quantity === 1 ? "en namnskylt" : `${quote.quantity} namnskyltar`;
  const intro = `Här är offerten på ${count} från ${seller}.`;
  const project = quote.project ? oneLine(quote.project) : "";
  const validUntil = formatDay(`${quote.validUntil}T12:00:00Z`);
  const rows: [string, string][] = [
    ["Offert", project ? `${quote.quoteNo}, ${project}` : quote.quoteNo],
    ["Summa exkl. moms", `${formatSek(quote.totalSek)}${plus}`],
    ["Summa inkl. moms", `${formatSek(quote.totalInclVatSek)}${plus}`],
    ["Giltig till och med", validUntil],
  ];
  const message = quote.message?.trim() ?? "";
  const how = "Knapparna öppnar offerten, där du ser skyltarna och bekräftar ditt val med ett klick.";
  const subject = oneLine(`Offert ${quote.quoteNo} från ${seller}`);
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
  const html = emailDocument({
    title: subject,
    preheader: `${intro} Giltig till och med ${validUntil}.`,
    rows: [
      brandRow(brand),
      headRow({
        eyebrow: `Offert · ${quote.quoteNo}`,
        title: project || `Din offert på ${count}`,
        lead: `Hej ${firstName}, ${intro.charAt(0).toLowerCase()}${intro.slice(1)}`,
      }),
      message ? quoteRow(message) : null,
      quote.picture
        ? pictureRow({ ...QUOTE_PICTURE, url: quote.picture.url, alt: "Skylten i offerten", href: quote.url, caption: quote.picture.caption })
        : null,
      factsRow([
        { label: "Antal", value: quote.quantity === 1 ? "1 skylt" : `${quote.quantity} skyltar` },
        { label: "Summa exkl. moms", value: `${formatSek(quote.totalSek)}${plus}` },
        { label: "Att betala inkl. moms", value: `${formatSek(quote.totalInclVatSek)}${plus}`, strong: true },
        { label: "Giltig till och med", value: validUntil },
      ]),
      actionsRow(
        [
          { href: accept, label: "Godkänn offerten" },
          { href: decline, label: "Neka offerten", kind: "secondary" },
        ],
        brand,
      ),
      noteRow(`${esc(how)} ${noteLink(quote.url, "Se offerten")}`),
      signatureRow("Vänliga hälsningar", seller),
      END_ROW,
    ].filter((part) => part !== null),
    footer: footerLines(sender.footer),
  });
  return {
    from: fromWithName(seller, sender.fromAddress),
    to: quote.customerEmail,
    replyTo: sender.replyTo,
    subject,
    html,
    text,
    headers: { "Auto-Submitted": "auto-generated" },
    // Samma utskick ger aldrig två mejl. Skickas offerten igen är det ett nytt utskick.
    idempotencyKey: `quote:${quote.quoteNo}:${quote.sentAt}`,
  };
}
