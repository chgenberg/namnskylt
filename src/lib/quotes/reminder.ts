import { formatDay, plural } from "@/lib/format";
import { badgeCount } from "@/lib/orders/model";
import { displayStatus, type StoredQuote } from "./model";

/**
 * Påminnelsen i panelen (beslut av ägaren 2026-11-24, efter Merchin): en offert som har väntat på
 * svar i några dagar får ett färdigt utkast till ett uppföljningsmejl, som säljaren läser, ändrar
 * och skickar från sitt eget mejlprogram. Ingenting skickas eller sparas här, så sajtens regler för
 * mejl berörs inte. Utkastet är en fast mall, utan AI.
 */

/** Så många dagar efter att offerten skickades är det dags att höra av sig. */
const REMINDER_AFTER_DAYS = 3;
const DAY_MS = 86_400_000;

type RemindedQuote = Pick<StoredQuote, "status" | "validUntil" | "sentAt" | "createdAt" | "demo" | "noCustomer">;

/**
 * Dags att påminna: offerten är skickad, gäller fortfarande, och skickades för minst tre dagar
 * sedan. En demooffert påminns aldrig om, eftersom den inte har någon riktig kund. Inte heller en
 * offert utan kund i registret: en som kunden laddade ner själv har ingen säljaren har skickat
 * något till, och det kunden skrev om sig själv är obekräftat.
 */
export function needsReminder(quote: RemindedQuote, now: Date): boolean {
  if (quote.demo || quote.noCustomer || displayStatus(quote, now) !== "sent") return false;
  const sent = Date.parse(quote.sentAt ?? quote.createdAt);
  if (Number.isNaN(sent)) return false;
  return now.getTime() - sent >= REMINDER_AFTER_DAYS * DAY_MS;
}

export interface ReminderInput {
  quote: Pick<StoredQuote, "quoteNo" | "project" | "validUntil" | "sentAt" | "createdAt" | "badges" | "customer">;
  /** Kundens länk till offerten, där den går att läsa och godkänna. */
  link: string;
  /** Säljaren som kunden möter: återförsäljaren, eller Skylt & Gravyrteknik på namnskylt.com. */
  sellerName: string;
}

export interface ReminderDraft {
  subject: string;
  body: string;
}

/** Det första ordet i kontaktpersonens namn, när det ser ut som ett förnamn och inte är företaget. */
function firstName(customer: ReminderInput["quote"]["customer"]): string | null {
  const name = customer.name.trim();
  if (!name || name === customer.company?.trim()) return null;
  const first = name.split(/\s+/)[0] ?? "";
  return /^\p{Lu}[\p{L}-]*$/u.test(first) ? first : null;
}

/** Ett kort utkast med kundens förnamn, vad offerten gäller, sista dagen och länken. */
export function reminderDraft({ quote, link, sellerName }: ReminderInput): ReminderDraft {
  const name = firstName(quote.customer);
  const project = quote.project?.trim();
  const what = project ? `${plural(badgeCount(quote), "namnskylt", "namnskyltar")} till ${project}` : plural(badgeCount(quote), "namnskylt", "namnskyltar");
  const sent = formatDay(quote.sentAt ?? quote.createdAt);
  return {
    subject: `Offert ${quote.quoteNo}${project ? ` – ${project}` : ""}`,
    body: [
      name ? `Hej ${name}!` : "Hej!",
      "",
      `Jag hör av mig om offerten på ${what} som vi skickade ${sent}. Den gäller till och med ${formatDay(`${quote.validUntil}T12:00:00Z`)}.`,
      "",
      "Har ni frågor, eller vill ni ändra något, svara bara på det här mejlet. Offerten går att läsa och godkänna här:",
      link,
      "",
      "Med vänliga hälsningar",
      sellerName,
    ].join("\n"),
  };
}

/** Länken som öppnar utkastet i säljarens eget mejlprogram. Utan adress fyller säljaren i mottagaren där. */
export function reminderMailto(email: string | null | undefined, draft: ReminderDraft): string {
  // Adressen står som den är: en kodad snabel-a läser inte alla mejlprogram. Allt annat än en vanlig adress utelämnas.
  const address = email?.trim() ?? "";
  const to = /^[^\s@?&#]+@[^\s@?&#]+$/.test(address) ? address : "";
  return `mailto:${to}?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`;
}
