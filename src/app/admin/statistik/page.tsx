import { adminTenant } from "@/features/admin/guard";
import { WeeklyChart } from "@/features/admin/weekly-chart";
import styles from "@/features/admin/admin.module.css";
import { formatSek } from "@/features/orders/format";
import { ORDER_SOURCE_LABEL, ORDER_SOURCES } from "@/lib/orders/model";
import { listOrders } from "@/lib/orders/repository";
import { orderStats } from "@/lib/orders/stats";

const RING_R = 52;
const RING_C = 2 * Math.PI * RING_R;

export default async function StatsPage() {
  const tenant = await adminTenant();
  if (!tenant) return null;
  const orders = await listOrders(tenant);
  const stats = orderStats(orders, new Date(), 12);
  const lastFour = stats.weeks.slice(-4).reduce((sum, w) => sum + w.revenueSek, 0);
  const prevFour = stats.weeks.slice(-8, -4).reduce((sum, w) => sum + w.revenueSek, 0);
  const trend = prevFour > 0 ? Math.round(((lastFour - prevFour) / prevFour) * 100) : null;
  const bySource = ORDER_SOURCES.map((source) => ({
    source,
    count: orders.filter((o) => o.source === source && o.status !== "cancelled").length,
  })).filter((s) => s.count > 0);

  return (
    <>
      <header className={styles.pageHead}>
        <div>
          <p className={styles.eyebrow}>Statistik</p>
          <h1 className={styles.pageTitle}>Försäljning</h1>
          <p className={styles.pageLead}>Avbrutna ordrar räknas inte. Belopp exkl. moms.</p>
        </div>
      </header>

      <div className={styles.kpis}>
        <div className={styles.kpi} data-tone="navy">
          <span className={styles.kpiLabel}>Senaste 4 veckorna</span>
          <span className={styles.kpiValue}>{formatSek(lastFour)}</span>
          <span className={styles.kpiHint}>
            {trend === null ? "ingen jämförelse än" : `${trend >= 0 ? "+" : ""}${trend} % mot veckorna innan`}
          </span>
        </div>
        <div className={styles.kpi}>
          <span className={styles.kpiLabel}>Totalt</span>
          <span className={styles.kpiValue}>{formatSek(stats.revenueSek)}</span>
          <span className={styles.kpiHint}>{stats.orderCount} ordrar</span>
        </div>
        <div className={styles.kpi}>
          <span className={styles.kpiLabel}>Snittorder</span>
          <span className={styles.kpiValue}>{formatSek(stats.averageOrderSek)}</span>
        </div>
        <div className={styles.kpi} data-tone="gold">
          <span className={styles.kpiLabel}>Skyltar sålda</span>
          <span className={styles.kpiValue}>{stats.badgeCount}</span>
        </div>
      </div>

      <section className={`${styles.panel} ${styles.section}`}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Ordervärde per vecka</h2>
          <span className={styles.muted}>12 veckor · guld = pågående vecka</span>
        </div>
        <WeeklyChart weeks={stats.weeks} />
      </section>

      <div className={`${styles.twoCol} ${styles.section}`}>
        <section className={styles.panel}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>Material</h2>
            <span className={styles.muted}>andel av sålda skyltar</span>
          </div>
          <div className={styles.bars}>
            {stats.materials.map((m) => (
              <div key={m.materialId} className={styles.bar}>
                <div className={styles.barHead}>
                  <span>{m.name}</span>
                  <span className="mono">
                    {m.badges} st · {Math.round(m.share * 100)} %
                  </span>
                </div>
                <div className={styles.barTrack}>
                  <div className={styles.barFill} style={{ width: `${Math.max(2, m.share * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>Återkommande kunder</h2>
          </div>
          <div className={styles.ring}>
            <svg viewBox="0 0 140 140" width="160" height="160" role="img" aria-label={`${Math.round(stats.repeatCustomerShare * 100)} procent återkommande`}>
              <circle cx="70" cy="70" r={RING_R} fill="none" stroke="#efeee9" strokeWidth="14" />
              <circle
                cx="70"
                cy="70"
                r={RING_R}
                fill="none"
                stroke="#0a0a0b"
                strokeWidth="14"
                strokeLinecap="round"
                strokeDasharray={`${RING_C * stats.repeatCustomerShare} ${RING_C}`}
                transform="rotate(-90 70 70)"
              />
              <text x="70" y="78" textAnchor="middle" fontSize="26" fontWeight="600" fill="#0a0a0b">
                {Math.round(stats.repeatCustomerShare * 100)}%
              </text>
            </svg>
            <span className={styles.muted}>av {stats.customers} kunder har beställt mer än en gång</span>
          </div>
          {bySource.length > 0 && (
            <dl className={styles.facts} style={{ marginTop: "var(--space-4)" }}>
              {bySource.map((s) => (
                <div key={s.source} style={{ display: "contents" }}>
                  <dt>{ORDER_SOURCE_LABEL[s.source]}</dt>
                  <dd>
                    {s.count} {s.count === 1 ? "order" : "ordrar"}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </section>
      </div>
    </>
  );
}
