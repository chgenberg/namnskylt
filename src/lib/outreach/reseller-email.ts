import { COPY, type EmailImageKind, type EmailStep, type OutreachLocale } from "./copy";
import { button, emailDocument, esc, FAINT, INK, LINE, MONO, MUTED, SANS, SERIF } from "./email-layout";
import { firstNameOf, type RelationSegment } from "./model";

/** Det korta mejlet: en hälsning, en bild som väcker nyfikenhet, en knapp. */

export interface EmailImage {
  url: string;
  width: number;
  height: number;
  /** `persona` = genererad person som bär skylten; `badge` = bara skylten. */
  kind: EmailImageKind;
  /** Materialet och måttet, t.ex. `gravyrplast Mörkblå / Vit, 70 × 25 mm`. */
  badgeCaption: string;
  hasLogo: boolean;
}

export interface ResellerEmailInput {
  step: EmailStep;
  segment: RelationSegment;
  locale: OutreachLocale;
  /** Namnet som graveras och används i hälsningen; `null` = bara företaget. */
  contactName: string | null;
  company: string;
  customerSinceYear: number | null;
  landingUrl: string;
  unsubscribeUrl: string;
  privacyUrl: string;
  image: EmailImage | null;
  sender: { legalName: string; orgNumber: string; address: string };
  signature: { name?: string; title?: string; phone?: string; email?: string };
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
    !input.image && "bild",
    !input.landingUrl && "landningslänk",
    !input.unsubscribeUrl && "avregistrering",
    (!input.sender.legalName.trim() || !input.sender.orgNumber.trim() || !input.sender.address.trim()) && "avsändare",
  ].filter((m): m is string => typeof m === "string");
}

const paragraph = (text: string, style = "") =>
  `<p class="ink" style="margin:0 0 14px;font-family:${SANS};font-size:17px;line-height:26px;color:${INK};${style}">${esc(text)}</p>`;

export function buildResellerEmail(input: ResellerEmailInput): ResellerEmailResult {
  const missing = missingFields(input);
  const copy = COPY[input.locale];
  const image = input.image;
  if (missing.length || !copy || !image) return { ok: false, missing };

  const company = input.company.trim();
  const first = firstNameOf(input.contactName);
  const ctx = { firstName: first, company, hasLogo: image.hasLogo, image: image.kind, segment: input.segment };
  const subject = copy.subject(input.step, ctx);
  const preheader = copy.preheader(input.step);
  const lead = copy.lead(input.step, ctx);
  const follow = copy.follow(input.step, ctx);
  const caption = copy.imageCaption(image.kind, image.badgeCaption);
  const sig = input.signature;
  const signer = sig.name ?? input.sender.legalName;
  const signatureLines = [sig.title, sig.phone, sig.email].filter((v): v is string => Boolean(v));
  const address = input.sender.address.replace(/\s*\n\s*/g, ", ");
  const senderLine = [input.sender.legalName, `${copy.orgNumber} ${input.sender.orgNumber}`, address].map(esc).join(" · ");
  const imageWidth = Math.min(528, image.width);

  const rows = [
    `<tr><td class="pad" style="padding:34px 36px 6px;"><h1 class="ink" style="margin:0 0 12px;font-family:${SERIF};font-size:26px;line-height:32px;font-weight:normal;color:${INK};">${esc(copy.greeting(first))}</h1>${paragraph(lead)}</td></tr>`,
    `<tr><td class="pad" align="center" style="padding:6px 36px 0;"><a href="${esc(input.landingUrl)}" style="text-decoration:none;"><img class="paper" src="${esc(image.url)}" width="${imageWidth}" alt="${esc(copy.imageAlt(ctx))}" style="display:block;width:100%;max-width:${imageWidth}px;height:auto;border-radius:14px;background:#f3f1ec;"></a></td></tr>`,
    `<tr><td class="pad muted" style="padding:10px 36px 0;font-family:${MONO};font-size:11px;line-height:16px;color:${FAINT};">${esc(caption)}</td></tr>`,
    `<tr><td class="pad" style="padding:22px 36px 4px;">${paragraph(follow)}</td></tr>`,
    `<tr><td class="pad" align="left" style="padding:6px 36px 8px;">${button(input.landingUrl, copy.cta)}</td></tr>`,
    `<tr><td class="pad" style="padding:22px 36px 30px;"><div class="line" style="border-top:1px solid ${LINE};margin:0 0 18px;font-size:0;line-height:0;">&nbsp;</div><p class="muted" style="margin:0 0 14px;font-family:${SANS};font-size:15px;line-height:22px;color:${MUTED};">${esc(copy.closing)}</p><p class="ink" style="margin:0;font-family:${SANS};font-size:15px;line-height:22px;color:${INK};">${esc(copy.signoff)}<br><strong>${esc(signer)}</strong></p>${
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
    `[${caption}]`,
    "",
    follow,
    "",
    `${copy.cta}: ${input.landingUrl}`,
    "",
    copy.closing,
    "",
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
