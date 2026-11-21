import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import adminStyles from "@/features/admin/admin.module.css";
import { adminTenant } from "@/features/admin/guard";
import { LeadDrawer } from "@/features/outreach/lead-drawer";
import { assetPath } from "@/lib/outreach/badge-asset";
import { emailMode } from "@/lib/email";
import { siteOrigin } from "@/lib/http/origin";
import { getCompanyProfile } from "@/lib/orders/repository";
import { issueLinkToken } from "@/lib/outreach/link-token";
import * as store from "@/lib/outreach/repository";
import { BLOCKER_LABELS, outreachBlockers, parseAllowlist } from "@/lib/outreach/send-gate";
import { warmupCap } from "@/lib/outreach/warmup";
import { supplierApiConfigured } from "@/lib/supplier/client";
import { isOwner, OWNER_TENANT } from "@/lib/tenants/model";

export const dynamic = "force-dynamic";

export default async function OutreachLeadPage({ params }: { params: Promise<{ leadId: string }> }) {
  const tenant = await adminTenant();
  if (!tenant) return null;
  if (!isOwner(tenant)) notFound();
  const id = z.uuid().safeParse((await params).leadId);
  if (!id.success) notFound();

  const sql = store.outreachDb();
  const lead = await store.getLead(sql, id.data);
  if (!lead) notFound();
  const [assets, messages, control, campaigns, company, suppressed, firstSent, origin] = await Promise.all([
    store.assetsForLead(sql, lead.id),
    store.messagesForLead(sql, lead.id),
    store.getControl(sql),
    store.listCampaigns(sql),
    getCompanyProfile(OWNER_TENANT),
    store.isSuppressed(sql, lead.email),
    store.firstRealSentAt(sql),
    siteOrigin(),
  ]);
  const campaign = campaigns.find((c) => c.slug === "aterforsaljare-v1");
  const hero = assets.find((a) => a.kind === "hero");
  const persona = assets.find((a) => a.kind === "persona");
  const now = new Date();

  const blockers = outreachBlockers(lead, {
    company,
    campaign: { fromEmail: campaign?.fromEmail ?? "", replyTo: campaign?.replyTo ?? "" },
    sendingDomain: process.env.OUTREACH_SENDING_DOMAIN ?? "",
    suppressed,
    allowlist: parseAllowlist(process.env.OUTREACH_ALLOWLIST),
    mode: control.mode === "live" && emailMode() === "live" ? "live" : "dry_run",
    supplierConfigured: supplierApiConfigured(),
    heroReady: hero !== undefined,
    openWaves: warmupCap(firstSent, now).waves,
  }).map((code) => BLOCKER_LABELS[code]);

  const first = messages[0];
  let landingUrl: string | null = null;
  try {
    landingUrl = first ? `${origin}/for/${issueLinkToken("landing", first.id, process.env.OUTREACH_LINK_SECRET, now)}` : null;
  } catch {
    landingUrl = null;
  }

  return (
    <>
      <header className={adminStyles.pageHead}>
        <div>
          <p className={adminStyles.eyebrow}>
            <Link className={adminStyles.link} href="/admin/utskick">
              Utskick
            </Link>
          </p>
          <h1 className={adminStyles.pageTitle}>{lead.companyName}</h1>
        </div>
      </header>
      <LeadDrawer
        lead={lead}
        heroUrl={hero ? assetPath(hero.id) : null}
        persona={persona ? { id: persona.id, url: assetPath(persona.id), review: persona.review } : null}
        blockers={blockers}
        messages={messages}
        landingUrl={landingUrl}
      />
    </>
  );
}
