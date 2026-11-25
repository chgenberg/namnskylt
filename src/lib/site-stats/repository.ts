import "server-only";
import { requireDb } from "@/lib/db/client";
import { SITE_VISIT_RETENTION_DAYS, type SiteVisitDevice } from "./model";

export interface NewSiteVisit {
  day: string;
  visitor: string;
  path: string;
  referrer: string | null;
  source: string | null;
  device: SiteVisitDevice;
}

export async function recordSiteVisit(visit: NewSiteVisit): Promise<void> {
  await requireDb()`
    insert into site_visits (day, visitor, path, referrer, source, device)
    values (${visit.day}, ${visit.visitor}, ${visit.path}, ${visit.referrer}, ${visit.source}, ${visit.device})`;
}

export interface SiteStats {
  days: number;
  /** Besökare per dag (koden byts varje dygn, så samma person räknas en gång per dag) och sidvisningar. */
  perDay: { day: string; visitors: number; views: number }[];
  views: number;
  /** Summan av dagarnas besökare: en person som kommer tre dagar räknas tre gånger. */
  visitorDays: number;
  pages: { path: string; views: number; visitors: number }[];
  sources: { source: string; visitors: number }[];
  devices: { device: SiteVisitDevice; visitors: number }[];
}

/** Statistiken för de senaste dagarna, i svensk tid. */
export async function siteStats(days = 30): Promise<SiteStats> {
  const sql = requireDb();
  const since = sql`(now() at time zone 'Europe/Stockholm')::date - ${days - 1}::int`;
  const [perDay, pages, sources, devices] = await Promise.all([
    sql<{ day: string; visitors: number; views: number }[]>`
      select to_char(day, 'YYYY-MM-DD') as day, count(distinct visitor)::int as visitors, count(*)::int as views
        from site_visits where day >= ${since} group by day order by day`,
    sql<{ path: string; views: number; visitors: number }[]>`
      select path, count(*)::int as views, count(distinct (day, visitor))::int as visitors
        from site_visits where day >= ${since} group by path order by views desc, path limit 12`,
    // En besökare per dag och källa: en kampanj under dagen (utskicket, utm_source) väger tyngst, annars sidan
    // besökaren först kom ifrån. Bara besökets första sida vet varifrån besökaren kom.
    sql<{ source: string; visitors: number }[]>`
      select source, count(*)::int as visitors from (
        select coalesce(
                 (array_agg(source order by at) filter (where source is not null))[1],
                 (array_agg(referrer order by at))[1],
                 'direkt') as source
          from site_visits where day >= ${since} group by day, visitor
      ) visits group by source order by visitors desc, source limit 10`,
    sql<{ device: SiteVisitDevice; visitors: number }[]>`
      select device, count(distinct (day, visitor))::int as visitors
        from site_visits where day >= ${since} group by device order by visitors desc`,
  ]);
  return {
    days,
    perDay,
    views: perDay.reduce((sum, row) => sum + row.views, 0),
    visitorDays: perDay.reduce((sum, row) => sum + row.visitors, 0),
    pages,
    sources,
    devices,
  };
}

/** Raderar besök äldre än 90 dagar, som Skylt & Gravyrtekniks integritetspolicy säger. */
export async function pruneSiteVisits(): Promise<number> {
  const rows = await requireDb()`
    delete from site_visits where day < (now() at time zone 'Europe/Stockholm')::date - ${SITE_VISIT_RETENTION_DAYS}::int`;
  return rows.count;
}
