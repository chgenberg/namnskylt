import { createHash } from "node:crypto";
import type { EmailMessage } from "@/lib/email";
import { actionsRow, brandRow, emailDocument, END_ROW, esc, factsRow, headRow, siteBrand, textRow, withParentLine } from "@/lib/email/layout";
import { oneLine } from "@/lib/email/transactional";
import { formatDate } from "@/lib/format";
import { CALLBACK_INBOX } from "./contact";
import { phoneDigits } from "./model";

/** Vem som bad om att bli uppringd, och var de kom ifrån. */
export interface CallbackNotice {
  name: string;
  phone: string;
  /** Företaget i utskicket, när besökaren kom från ett mejl. */
  company: string | null;
  /** Adressen mejlet gick till, när besökaren kom från ett mejl. */
  leadEmail: string | null;
  at: Date;
}

/**
 * Mejlet till hej@namnskylt.com när någon vill bli uppringd (besked av ägaren 2026-11-25). Ämnesraden
 * bär namn och nummer, så att det syns i inkorgen utan att mejlet öppnas, och knappen ringer upp.
 */
export function composeCallbackEmail(notice: CallbackNotice, settings: { from: string; origin: string }): EmailMessage {
  const brand = siteBrand(settings.origin);
  const name = oneLine(notice.name);
  const phone = oneLine(notice.phone);
  const tel = phoneDigits(phone).replace(/^0/, "+46");
  const facts = [
    { label: "Namn", value: name },
    { label: "Telefon", value: phone },
    ...(notice.company ? [{ label: "Företag", value: oneLine(notice.company) }] : []),
    ...(notice.leadEmail ? [{ label: "Mejlet gick till", value: notice.leadEmail }] : []),
    { label: "Skickat", value: formatDate(notice.at.toISOString()) },
  ];
  const lead = notice.company
    ? `${name} på ${oneLine(notice.company)} har sett filmen och vill bli uppringd.`
    : `${name} vill bli uppringd om namnskylt.com.`;
  const html = emailDocument({
    title: `Ring upp ${name}`,
    preheader: `${name}, ${phone}`,
    brand,
    rows: [
      brandRow(brand),
      headRow({ eyebrow: "Bli uppringd", title: `Ring upp ${name}`, lead }),
      factsRow(facts),
      actionsRow([{ href: `tel:${tel}`, label: `Ring ${phone}` }], brand),
      textRow(notice.company ? "Kom från utskicket till återförsäljare." : "Kom från sidan med filmen på namnskylt.com."),
      END_ROW,
    ],
    footer: [esc("Skickat från sidan med filmen på namnskylt.com.")],
  });
  const text = withParentLine(
    [lead, "", ...facts.map((fact) => `${fact.label}: ${fact.value}`)].join("\n"),
    brand,
  );
  // Samma namn och nummer inom samma minut är samma förfrågan, också om knappen trycks två gånger.
  const minute = Math.floor(notice.at.getTime() / 60_000);
  const key = createHash("sha256").update(`${name.toLowerCase()}|${phoneDigits(phone)}|${minute}`).digest("hex").slice(0, 32);
  return {
    from: settings.from,
    to: CALLBACK_INBOX,
    replyTo: CALLBACK_INBOX,
    subject: `Ring upp: ${name}, ${phone}`,
    html,
    text,
    headers: {},
    idempotencyKey: `callback:${key}`,
  };
}
