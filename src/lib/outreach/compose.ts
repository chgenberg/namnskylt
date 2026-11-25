import type { EmailMessage } from "@/lib/email/types";
import { localeFor, type EmailStep } from "./copy";
import { issueLinkToken, LinkSecretError } from "./link-token";
import { relationSegment } from "./model";
import { buildResellerEmail } from "./reseller-email";
import { CALLBACK_INBOX, DEMO_PATH } from "@/lib/callback/contact";
import { WORKSHOP_COMPANY } from "@/lib/company/workshop";
import { OUTREACH_HERO } from "./hero";
import type { AssetMeta, CampaignRow, LeadRow, MessageRow } from "./store";

export interface ComposeInput {
  message: Pick<MessageRow, "id" | "step" | "idempotencyKey">;
  lead: LeadRow;
  campaign: CampaignRow;
  /** Leadets bilder. Mejlet visar ingen bild sedan 2026-11-25, men kön skickar dem fortfarande med. */
  assets: readonly AssetMeta[];
  sender: { legalName: string; orgNumber: string; address: string };
  siteUrl: string;
  linkSecret: string | undefined;
  now: Date;
}

export type Composed = { ok: true; email: EmailMessage } | { ok: false; missing: string[] };

type Company = { name: string; orgNumber: string; address: string };

export const companySender = (c: Company) => ({ legalName: c.name, orgNumber: c.orgNumber, address: c.address });

/** Domänen utskicket skickas från, om `OUTREACH_SENDING_DOMAIN` inte säger något annat (beslut 2026-11-25). */
export const DEFAULT_SENDING_DOMAIN = "utskick.skyltochgravyr.com";

/**
 * Kampanjens avsändare (besked av ägaren 2026-11-25): avsändarnamnet Namnskylt, adressen info@ på
 * utskickets egen underdomän, svar till hej@namnskylt.com, och signaturen "Gänget på Namnskylt".
 */
export function outreachCampaignSender(env: Record<string, string | undefined> = process.env) {
  const domain = env.OUTREACH_SENDING_DOMAIN?.trim() || DEFAULT_SENDING_DOMAIN;
  return {
    fromName: "Namnskylt",
    fromEmail: `info@${domain}`,
    replyTo: CALLBACK_INBOX,
    signature: { name: "Gänget på Namnskylt", email: CALLBACK_INBOX },
  };
}

/**
 * Avsändaren i utskickets sidfot: Skylt & Gravyrteknik, som står bakom namnskylt.com och har
 * kundrelationen (besked av ägaren 2026-11-25). Adminens företagsuppgifter tillhör ett annat
 * företag och används inte här.
 */
export function outreachSenderCompany(): Company {
  return {
    name: WORKSHOP_COMPANY.legalName,
    orgNumber: WORKSHOP_COMPANY.orgNumber,
    address: `${WORKSHOP_COMPANY.street}, ${WORKSHOP_COMPANY.zipCity}`,
  };
}

/** Förhandsvisning och dry-run ska gå att granska innan företagsprofilen är ifylld; live stoppas av blockerarna. */
export function previewSender(c: Company) {
  return {
    legalName: c.name.trim() || "[Juridiskt namn saknas]",
    orgNumber: c.orgNumber.trim() || "[Org.nr saknas]",
    address: c.address.trim() || "[Adress saknas]",
  };
}

function emailStepFor(campaign: CampaignRow, step: number): EmailStep {
  return campaign.steps.find((s) => s.step === step)?.template === "reminder" ? 2 : 1;
}

const formatFrom = (name: string, email: string) => `${name.replace(/["<>]/g, "").trim()} <${email}>`;

/** Ett meddelande färdigt för avsändaren. Länkarna bär meddelandets id, inget annat. */
export function composeOutreachEmail(input: ComposeInput): Composed {
  const { message, lead, campaign, siteUrl, now } = input;
  let landing: string;
  let unsubscribe: string;
  try {
    landing = issueLinkToken("landing", message.id, input.linkSecret, now);
    unsubscribe = issueLinkToken("unsubscribe", message.id, input.linkSecret, now);
  } catch (error) {
    if (error instanceof LinkSecretError) return { ok: false, missing: ["länkhemlighet"] };
    throw error;
  }

  const result = buildResellerEmail({
    step: emailStepFor(campaign, message.step),
    segment: relationSegment(lead),
    locale: localeFor(lead.country),
    contactName: lead.contactName,
    company: lead.companyName,
    // Sidan med filmen och formuläret för att bli uppringd; länkkoden säger vem som kom (2026-11-25).
    filmUrl: `${siteUrl}${DEMO_PATH}?k=${landing}`,
    heroImage: { ...OUTREACH_HERO, url: `${siteUrl}${OUTREACH_HERO.src}` },
    unsubscribeUrl: `${siteUrl}/avregistrera/${unsubscribe}`,
    privacyUrl: `${siteUrl}/integritet`,
    sender: input.sender,
    signature: campaign.signature,
  });
  if (!result.ok) return result;

  return {
    ok: true,
    email: {
      from: formatFrom(campaign.fromName, campaign.fromEmail),
      to: lead.email,
      replyTo: campaign.replyTo,
      subject: result.email.subject,
      html: result.email.html,
      text: result.email.text,
      headers: result.email.headers,
      idempotencyKey: message.idempotencyKey,
    },
  };
}
