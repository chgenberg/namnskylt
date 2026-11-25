import "server-only";
import { db } from "@/lib/db/client";
import { landingMessageId } from "@/lib/outreach/landing";
import { linkSecrets } from "@/lib/outreach/link-token";
import { getLead, getMessage } from "@/lib/outreach/store";

/** Mottagaren av utskicksmejlet som länken på sidan med filmen bär, om den gäller. */
export interface DemoLead {
  leadId: string;
  company: string;
  contactName: string | null;
  email: string;
}

/**
 * Vem som kom till sidan med filmen från utskicksmejlet (`?k=`, mejlets länkkod). En kod som inte gäller,
 * har gått ut eller hör till en avregistrerad mottagare ger `null`, samma svar oavsett varför.
 */
export async function demoLeadFor(token: string | null | undefined, now = new Date()): Promise<DemoLead | null> {
  if (!token) return null;
  const messageId = landingMessageId(token, linkSecrets(), now);
  const sql = db();
  if (!messageId || !sql) return null;
  const message = await getMessage(sql, messageId);
  const lead = message ? await getLead(sql, message.leadId) : null;
  if (!lead || lead.status === "suppressed") return null;
  return { leadId: lead.id, company: lead.companyName, contactName: lead.contactName, email: lead.email };
}
