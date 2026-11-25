import { NextResponse } from "next/server";
import { z } from "zod";
import { databaseConfigured } from "@/lib/orders/repository";
import { composeOutreachEmail, outreachSenderCompany, previewSender } from "@/lib/outreach/compose";
import * as store from "@/lib/outreach/repository";
import { siteOrigin } from "@/lib/http/origin";
import { currentTenant } from "@/lib/reseller-auth/session";
import { isOwner } from "@/lib/tenants/model";

export const runtime = "nodejs";

/** Mejlet precis som mottagaren skulle få det. Visas i en `iframe sandbox`; inget skrivs och inget skickas. */
export async function GET(_request: Request, { params }: { params: Promise<{ messageId: string }> }) {
  const tenant = await currentTenant();
  if (!tenant || !isOwner(tenant)) return NextResponse.json({ error: "Bara ägaren" }, { status: 403 });
  if (!databaseConfigured()) return NextResponse.json({ error: "Databasen är inte kopplad" }, { status: 503 });
  const id = z.uuid().safeParse((await params).messageId);
  if (!id.success) return NextResponse.json({ error: "Okänt meddelande" }, { status: 404 });

  const sql = store.outreachDb();
  const message = await store.getMessage(sql, id.data);
  const lead = message ? await store.getLead(sql, message.leadId) : null;
  const campaign = message ? await store.getCampaign(sql, message.campaignId) : null;
  if (!message || !lead || !campaign) return NextResponse.json({ error: "Okänt meddelande" }, { status: 404 });

  const composed = composeOutreachEmail({
    message,
    lead,
    campaign,
    assets: await store.assetsForLead(sql, lead.id),
    sender: previewSender(outreachSenderCompany()),
    // Bilderna hämtas från sajten som visar förhandsvisningen, så de syns även lokalt.
    siteUrl: await siteOrigin(),
    linkSecret: process.env.OUTREACH_LINK_SECRET,
    now: new Date(),
  });
  const html = composed.ok
    ? composed.email.html
    : `<!doctype html><meta charset="utf-8"><p style="font:14px system-ui;padding:24px">Mejlet går inte att bygga: saknar ${composed.missing.join(", ")}.</p>`;
  return new NextResponse(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "content-security-policy": "sandbox; default-src 'none'; img-src https: data: http://localhost:*; style-src 'unsafe-inline'",
      "x-robots-tag": "noindex",
    },
  });
}
