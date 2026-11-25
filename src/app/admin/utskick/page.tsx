import { notFound } from "next/navigation";
import Link from "next/link";
import adminStyles from "@/features/admin/admin.module.css";
import { adminTenant } from "@/features/admin/guard";
import { formatDate } from "@/lib/format";
import { ControlBar } from "@/features/outreach/control-bar";
import { FunnelKpis } from "@/features/outreach/funnel-kpis";
import { LEAD_STATUS_LABEL, tickSummary, WAVE_LABEL } from "@/features/outreach/labels";
import { LeadTable, type LeadTableRow } from "@/features/outreach/lead-table";
import styles from "@/features/outreach/outreach.module.css";
import { emailMode } from "@/lib/email";
import { funnelFromRows } from "@/lib/outreach/funnel";
import {
  COUNTRIES,
  LEAD_STATUSES,
  RELATION_SEGMENT_LABELS,
  RELATION_SEGMENTS,
  relationSegment,
  WAVES,
  type Country,
  type LeadStatus,
  type RelationSegment,
  type Wave,
} from "@/lib/outreach/model";
import * as store from "@/lib/outreach/repository";
import type { TickResult } from "@/lib/outreach/tick";
import { isInSendWindow } from "@/lib/outreach/warmup";
import { isOwner } from "@/lib/tenants/model";

export const dynamic = "force-dynamic";

const CRON_STALE_MS = 15 * 60_000;

interface Filters {
  wave?: string;
  status?: string;
  country?: string;
  segment?: string;
  check?: string;
}

const pick = <T extends string>(value: string | undefined, allowed: readonly T[]): T | undefined =>
  allowed.includes(value as T) ? (value as T) : undefined;

function isTickResult(value: unknown): value is TickResult {
  return typeof value === "object" && value !== null && "items" in value && Array.isArray(value.items);
}

export default async function OutreachPage({ searchParams }: { searchParams: Promise<Filters> }) {
  const tenant = await adminTenant();
  if (!tenant) return null;
  if (!isOwner(tenant)) notFound();
  const params = await searchParams;
  const wave = pick<Wave | "none">(params.wave, [...WAVES, "none"]);
  const status = pick<LeadStatus>(params.status, LEAD_STATUSES);
  const country = pick<Country>(params.country, COUNTRIES);
  const segment = pick<RelationSegment>(params.segment, RELATION_SEGMENTS);
  const onlyCheck = params.check === "1";

  const sql = store.outreachDb();
  const [control, campaigns, leads, heroes, personas, latest, ticks, funnelSource] = await Promise.all([
    store.getControl(sql),
    store.listCampaigns(sql),
    store.listLeads(sql, { wave: wave === "none" ? null : wave, status, country, limit: 2000 }),
    store.leadIdsWithHero(sql),
    store.personaReviewByLead(sql),
    store.latestMessageStatus(sql),
    store.recentTicks(sql, 1),
    store.funnelRows(sql),
  ]);
  const campaign = campaigns.find((c) => c.slug === "aterforsaljare-v1") ?? null;
  const lastTick = ticks[0] ?? null;
  const now = new Date();
  const pendingPersonas = [...personas.values()].filter((r) => r === "pending").length;

  const rows: LeadTableRow[] = leads
    .filter((l) => (wave === "none" ? l.wave === null : true))
    .filter((l) => !segment || relationSegment(l) === segment)
    .filter((l) => !onlyCheck || l.checkReason !== null)
    .map((l) => ({
      id: l.id,
      company: l.companyName,
      contact: l.contactName,
      city: l.city,
      country: l.country,
      wave: l.wave,
      segment: RELATION_SEGMENT_LABELS[relationSegment(l)],
      status: l.status,
      checkReason: l.checkReason,
      heroReady: heroes.has(l.id),
      persona: personas.get(l.id) ?? null,
      messageStatus: latest.get(l.id) ?? null,
      landed: l.landedAt !== null,
      callback: l.callbackAt !== null,
    }));

  return (
    <>
      <header className={adminStyles.pageHead}>
        <div>
          <p className={adminStyles.eyebrow}>Utskick</p>
          <h1 className={adminStyles.pageTitle}>Återförsäljare</h1>
          <p className={adminStyles.pageLead}>
            Godkänn mottagare, granska mejlet och kör en tick. Inget riktigt mejl går förrän läget är Live, vilket kräver
            Resend-nyckeln.
          </p>
        </div>
      </header>

      <ControlBar
        paused={control.paused}
        mode={control.mode}
        liveAvailable={emailMode() === "live"}
        campaignActive={campaign?.status === "active"}
        campaignPausedReason={campaign?.pausedReason ?? null}
        lastTick={
          lastTick
            ? {
                at: formatDate(lastTick.startedAt.toISOString()),
                summary: isTickResult(lastTick.result) ? tickSummary(lastTick.result) : "pågår",
              }
            : null
        }
        cronStale={
          !control.paused &&
          campaign?.status === "active" &&
          isInSendWindow(now) &&
          (!lastTick || now.getTime() - lastTick.startedAt.getTime() > CRON_STALE_MS)
        }
      />

      <FunnelKpis funnel={funnelFromRows(funnelSource)} />

      {pendingPersonas > 0 && (
        <p className={styles.warning} style={{ marginBottom: "var(--space-5)" }}>
          {pendingPersonas} personbilder väntar på granskning. Tills de är godkända visar mejlet bara skylten.{" "}
          <Link className={adminStyles.link} href="/admin/utskick/bilder">
            Granska bilderna
          </Link>
        </p>
      )}

      <form className={styles.filterForm} method="get">
        <label className={styles.filterField}>
          Våg
          <select className={adminStyles.select} name="wave" defaultValue={wave ?? ""}>
            <option value="">Alla</option>
            {WAVES.map((w) => (
              <option key={w} value={w}>
                {WAVE_LABEL[w]}
              </option>
            ))}
            <option value="none">Ingen våg</option>
          </select>
        </label>
        <label className={styles.filterField}>
          Segment
          <select className={adminStyles.select} name="segment" defaultValue={segment ?? ""}>
            <option value="">Alla</option>
            {RELATION_SEGMENTS.map((s) => (
              <option key={s} value={s}>
                {RELATION_SEGMENT_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.filterField}>
          Land
          <select className={adminStyles.select} name="country" defaultValue={country ?? ""}>
            <option value="">Alla</option>
            {COUNTRIES.map((c) => (
              <option key={c} value={c}>
                {c.toUpperCase()}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.filterField}>
          Status
          <select className={adminStyles.select} name="status" defaultValue={status ?? ""}>
            <option value="">Alla</option>
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {LEAD_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.filterField}>
          <span>
            <input type="checkbox" name="check" value="1" defaultChecked={onlyCheck} /> Bara att kontrollera
          </span>
        </label>
        <button type="submit" className="btn btn--ghost">
          Filtrera
        </button>
        <span className={adminStyles.muted}>{rows.length} leads</span>
      </form>

      <LeadTable rows={rows} />
    </>
  );
}
