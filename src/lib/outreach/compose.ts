import type { EmailMessage } from "@/lib/email/types";
import { assetPath, badgeCaption } from "./badge-asset";
import { localeFor, type EmailStep } from "./copy";
import { issueLinkToken, LinkSecretError } from "./link-token";
import { relationSegment } from "./model";
import { buildResellerEmail } from "./reseller-email";
import { approvedPersona, type AssetMeta, type CampaignRow, type LeadRow, type MessageRow } from "./store";

export interface ComposeInput {
  message: Pick<MessageRow, "id" | "step" | "idempotencyKey">;
  lead: LeadRow;
  campaign: CampaignRow;
  assets: readonly AssetMeta[];
  sender: { legalName: string; orgNumber: string; address: string };
  siteUrl: string;
  linkSecret: string | undefined;
  now: Date;
}

export type Composed = { ok: true; email: EmailMessage } | { ok: false; missing: string[] };

type Company = { name: string; orgNumber: string; address: string };

export const companySender = (c: Company) => ({ legalName: c.name, orgNumber: c.orgNumber, address: c.address });

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

function yearOf(isoDate: string | null): number | null {
  const year = isoDate ? Number(isoDate.slice(0, 4)) : NaN;
  return Number.isInteger(year) && year > 1900 ? year : null;
}

const formatFrom = (name: string, email: string) => `${name.replace(/["<>]/g, "").trim()} <${email}>`;

/** Ett meddelande färdigt för avsändaren. Länkarna bär meddelandets id, inget annat. */
export function composeOutreachEmail(input: ComposeInput): Composed {
  const { message, lead, campaign, assets, siteUrl, now } = input;
  let landing: string;
  let unsubscribe: string;
  try {
    landing = issueLinkToken("landing", message.id, input.linkSecret, now);
    unsubscribe = issueLinkToken("unsubscribe", message.id, input.linkSecret, now);
  } catch (error) {
    if (error instanceof LinkSecretError) return { ok: false, missing: ["länkhemlighet"] };
    throw error;
  }

  const shown = approvedPersona(assets) ?? assets.find((a) => a.kind === "hero");
  const result = buildResellerEmail({
    step: emailStepFor(campaign, message.step),
    segment: relationSegment(lead),
    locale: localeFor(lead.country),
    contactName: lead.contactName,
    company: lead.companyName,
    customerSinceYear: yearOf(lead.customerSince),
    landingUrl: `${siteUrl}/for/${landing}`,
    unsubscribeUrl: `${siteUrl}/avregistrera/${unsubscribe}`,
    privacyUrl: `${siteUrl}/integritet`,
    image: shown
      ? {
          url: `${siteUrl}${assetPath(shown.id)}`,
          width: shown.width,
          height: shown.height,
          kind: shown.kind === "persona" ? "persona" : "badge",
          badgeCaption: badgeCaption(shown),
          hasLogo: shown.logoStatus === "logo",
        }
      : null,
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
