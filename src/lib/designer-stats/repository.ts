import "server-only";
import { requireDb } from "@/lib/db/client";
import { DESIGNER_STEPS, FUNNEL_DAYS, WEB_SCOPE, type DesignerEventStep } from "./model";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Äldre händelser än så här tas bort av städningen. */
const KEEP_DAYS = 180;

/**
 * Sparar att ett besök har nått ett steg. Samma besök och steg sparas en gång.
 * Raden bär inget om vem besökaren är: bara ett slumpat id, var skyltmotorn
 * var öppnad och steget. En butik som inte finns sparas inte.
 */
export async function recordDesignerEvent(visit: string, scope: string, step: DesignerEventStep): Promise<void> {
  const sql = requireDb();
  await sql`
    insert into designer_events (visit, scope, step)
    select ${visit}, ${scope}, ${step}
     where ${scope} = ${WEB_SCOPE} or exists (select 1 from shops where slug = ${scope})
    on conflict (visit, step) do nothing`;
}

export interface DesignerFunnelRows {
  /** Antal besök per längsta steg, i samma ordning som `DESIGNER_STEPS`. */
  furthest: number[];
  /** Besök som lade något i varukorgen. */
  cartVisits: number;
}

/** Besöken i ett sammanhang de senaste dagarna, räknade efter hur långt de kom. */
export async function designerFunnelRows(scope: string, days: number = FUNNEL_DAYS, now: Date = new Date()): Promise<DesignerFunnelRows> {
  const sql = requireDb();
  const since = new Date(now.getTime() - days * DAY_MS);
  const steps = sql.array([...DESIGNER_STEPS]);
  const [rows, [cart]] = await Promise.all([
    sql<{ furthest: number; visits: number }[]>`
      select furthest, count(*)::int as visits
        from (select visit, max(array_position(${steps}::text[], step)) as furthest
                from designer_events
               where scope = ${scope} and at >= ${since} and step = any(${steps}::text[])
               group by visit) per_visit
       group by furthest`,
    sql<{ visits: number }[]>`
      select count(distinct visit)::int as visits from designer_events where scope = ${scope} and at >= ${since} and step = 'cart'`,
  ]);
  const furthest = DESIGNER_STEPS.map(() => 0);
  // `array_position` räknar från 1.
  for (const row of rows) if (row.furthest >= 1 && row.furthest <= furthest.length) furthest[row.furthest - 1] = row.visits;
  return { furthest, cartVisits: cart?.visits ?? 0 };
}

/** Sammanhangen som har haft besök de senaste dagarna, flest besök först. */
export async function designerScopes(days: number = FUNNEL_DAYS, now: Date = new Date()): Promise<{ scope: string; visits: number }[]> {
  const sql = requireDb();
  const since = new Date(now.getTime() - days * DAY_MS);
  const rows = await sql<{ scope: string; visits: number }[]>`
    select scope, count(distinct visit)::int as visits from designer_events where at >= ${since} group by scope order by visits desc, scope`;
  return [...rows];
}

/** Tar bort gamla händelser. Körs av bakgrundsjobbet. */
export async function pruneDesignerEvents(olderThanDays: number = KEEP_DAYS): Promise<number> {
  const sql = requireDb();
  const rows = await sql`
    delete from designer_events where at < now() - make_interval(days => ${Math.max(1, Math.floor(olderThanDays))}) returning id`;
  return rows.length;
}
