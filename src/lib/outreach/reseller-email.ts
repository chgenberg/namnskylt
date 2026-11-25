import { COPY, type EmailStep, type OutreachLocale } from "./copy";
import { button, emailDocument, esc, FAINT, INK, LINE, MONO, MUTED, SANS, SERIF } from "@/lib/email/layout";
import { DEMO_CONTACT } from "@/lib/callback/contact";
import { firstNameOf, type RelationSegment } from "./model";

/**
 * Det enkla mejlet (besked av ägaren 2026-11-25): en hälsning, ett stycke om namnskylt.com, en länk till
 * filmen och en enda knapp, som ringer Pär för en demo på fem minuter. Ingen bild och ingen butik.
 */

export interface ResellerEmailInput {
  step: EmailStep;
  segment: RelationSegment;
  locale: OutreachLocale;
  /** Namnet i hälsningen; `null` = bara "Hej!". */
  contactName: string | null;
  company: string;
  customerSinceYear: number | null;
  /** Sidan med filmen och formuläret för att bli uppringd, med mottagarens länkkod. */
  filmUrl: string;
  unsubscribeUrl: string;
  privacyUrl: string;
  sender: { legalName: string; orgNumber: string; address: string };
  signature: { name?: string; title?: string; phone?: string; email?: string };
  /** Toppbilden, med full adress. Utan den börjar mejlet med hälsningen. */
  heroImage?: { url: string; width: number; height: number } | null;
  /** Den som visar; förvalt Pär Philipson. */
  contact?: { name: string; firstName: string; phone: string; tel: string };
}

export interface ResellerEmail {
  subject: string;
  preheader: string;
  html: string;
  text: string;
  headers: Record<string, string>;
}

export type ResellerEmailResult = { ok: true; email: ResellerEmail } | { ok: false; missing: string[] };

function missingFields(input: ResellerEmailInput): string[] {
  return [
    !COPY[input.locale] && "språk",
    !input.company.trim() && "företag",
    !input.filmUrl && "filmlänk",
    !input.unsubscribeUrl && "avregistrering",
    (!input.sender.legalName.trim() || !input.sender.orgNumber.trim() || !input.sender.address.trim()) && "avsändare",
  ].filter((m): m is string => typeof m === "string");
}

const paragraph = (text: string, style = "") =>
  `<p class="ink" style="margin:0 0 14px;font-family:${SANS};font-size:17px;line-height:26px;color:${INK};${style}">${esc(text)}</p>`;

export function buildResellerEmail(input: ResellerEmailInput): ResellerEmailResult {
  const missing = missingFields(input);
  const copy = COPY[input.locale];
  if (missing.length || !copy) return { ok: false, missing };

  const company = input.company.trim();
  const first = firstNameOf(input.contactName);
  const contact = input.contact ?? DEMO_CONTACT;
  const ctx = { firstName: first, company, segment: input.segment };
  const subject = copy.subject(input.step, ctx);
  const preheader = copy.preheader(input.step);
  const lead = copy.lead(input.step, ctx);
  const demo = copy.demo(contact);
  const cta = copy.cta(contact);
  const tel = `tel:${contact.tel}`;
  const sig = input.signature;
  const signer = sig.name ?? input.sender.legalName;
  const signatureLines = [sig.title, sig.phone, sig.email].filter((v): v is string => Boolean(v));
  const address = input.sender.address.replace(/\s*\n\s*/g, ", ");
  const senderLine = [input.sender.legalName, `${copy.orgNumber} ${input.sender.orgNumber}`, address].map(esc).join(" · ");

  const hero = input.heroImage;
  const heroWidth = hero ? Math.min(528, hero.width) : 0;
  const rows = [
    ...(hero
      ? [
          `<tr><td class="pad" align="center" style="padding:28px 36px 0;"><a href="${esc(input.filmUrl)}" style="text-decoration:none;"><img src="${esc(hero.url)}" width="${heroWidth}" alt="${esc(copy.heroAlt(contact))}" style="display:block;width:100%;max-width:${heroWidth}px;height:auto;border:0;"></a></td></tr>`,
          `<tr><td class="pad muted" style="padding:8px 36px 0;font-family:${MONO};font-size:11px;line-height:16px;color:${FAINT};">${esc(copy.heroCaption)}</td></tr>`,
        ]
      : []),
    `<tr><td class="pad" style="padding:${hero ? 22 : 34}px 36px 6px;"><h1 class="ink" style="margin:0 0 12px;font-family:${SERIF};font-size:26px;line-height:32px;font-weight:normal;color:${INK};">${esc(copy.greeting(first))}</h1>${paragraph(lead)}</td></tr>`,
    `<tr><td class="pad" style="padding:2px 36px 10px;"><a class="ink" href="${esc(input.filmUrl)}" style="font-family:${SANS};font-size:17px;line-height:26px;color:${INK};text-decoration:underline;text-underline-offset:3px;">&#9654;&#xFE0E; ${esc(copy.filmLink)}</a></td></tr>`,
    `<tr><td class="pad" style="padding:18px 36px 4px;">${paragraph(demo)}</td></tr>`,
    `<tr><td class="pad" align="left" style="padding:2px 36px 8px;">${button(tel, cta)}</td></tr>`,
    `<tr><td class="pad" style="padding:22px 36px 30px;"><div class="line" style="border-top:1px solid ${LINE};margin:0 0 18px;font-size:0;line-height:0;">&nbsp;</div>${copy.closing ? `<p class="muted" style="margin:0 0 14px;font-family:${SANS};font-size:15px;line-height:22px;color:${MUTED};">${esc(copy.closing)}</p>` : ""}<p class="ink" style="margin:0;font-family:${SANS};font-size:15px;line-height:22px;color:${INK};">${esc(copy.signoff)}<br><strong>${esc(signer)}</strong></p>${
      signatureLines.length ? `<p class="muted" style="margin:4px 0 0;font-family:${SANS};font-size:13px;line-height:20px;color:${FAINT};">${signatureLines.map(esc).join("<br>")}</p>` : ""
    }</td></tr>`,
  ];

  const footer = [
    senderLine,
    esc(copy.relationLine(company, input.customerSinceYear)),
    `<a href="${esc(input.privacyUrl)}" style="color:${FAINT};">${esc(copy.privacy)}</a> · <a href="${esc(input.unsubscribeUrl)}" style="color:${FAINT};">${esc(copy.unsubscribe)}</a>`,
  ];

  const html = emailDocument({ title: subject, preheader, rows, footer });

  const text = [
    copy.greeting(first),
    "",
    lead,
    "",
    `${copy.filmLink}: ${input.filmUrl}`,
    "",
    demo,
    `${cta}`,
    "",
    ...(copy.closing ? [copy.closing, ""] : []),
    copy.signoff,
    signer,
    ...signatureLines,
    "",
    "—",
    `${input.sender.legalName} · ${copy.orgNumber} ${input.sender.orgNumber} · ${address}`,
    copy.relationLine(company, input.customerSinceYear),
    `${copy.privacy}: ${input.privacyUrl}`,
    `${copy.unsubscribe}: ${input.unsubscribeUrl}`,
  ].join("\n");

  return {
    ok: true,
    email: {
      subject,
      preheader,
      html,
      text,
      headers: {
        "List-Unsubscribe": `<${input.unsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    },
  };
}
