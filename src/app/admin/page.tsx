import Link from "next/link";
import { FillDemoButton } from "@/features/admin/demo-data-controls";
import { adminTenant } from "@/features/admin/guard";
import { OrderCard } from "@/features/admin/order-card";
import { RepeatButton } from "@/features/admin/repeat-button";
import { Sparkline } from "@/features/admin/sparkline";
import styles from "@/features/admin/admin.module.css";
import { formatRelative, formatSek } from "@/features/orders/format";
import { badgeCount, type StoredOrder } from "@/lib/orders/model";
import { listOrders } from "@/lib/orders/repository";
import { orderStats } from "@/lib/orders/stats";

const DAY_MS = 86_400_000;
/** Efter så lång tid utan ny order föreslår panelen att höra av sig. */
const REORDER_AFTER_DAYS = 60;

function greeting(now: Date): string {
  const hour = Number(new Intl.DateTimeFormat("sv-SE", { hour: "numeric", timeZone: "Europe/Stockholm" }).format(now));
  if (hour < 10) return "God morgon";
  if (hour < 17) return "God eftermiddag";
  return "God kväll";
}

function changesRequested(order: StoredOrder): boolean {
  const last = order.events.at(-1);
  return order.status === "received" && Boolean(last?.note?.startsWith("Kunden vill ändra"));
}

export default async function AdminOverviewPage() {
  const tenant = await adminTenant();
  if (!tenant) return null;
  const orders = await listOrders(tenant);
  const now = new Date();
  if (orders.length === 0) {
    return (
      <section className={styles.welcome}>
        <p className={styles.eyebrow}>Välkommen</p>
        <h1 className={styles.welcomeTitle}>Här hamnar alla ordrar från namnskylt.com</h1>
        <p className={styles.muted}>
          Inga ordrar än. Fyll panelen med påhittade kunder och ordrar för att se hur den fungerar — demodatan märks
          tydligt, skickas aldrig till tillverkningen och tas bort med ett klick.
        </p>
        <FillDemoButton onDark />
      </section>
    );
  }
  const stats = orderStats(orders, now, 8);
  const recent = orders.filter((o) => now.getTime() - Date.parse(o.placedAt) < 30 * DAY_MS && o.status !== "cancelled");
  const recentRevenue = recent.reduce((sum, o) => sum + o.totalSek, 0);

  const toHandle = orders.filter((o) => o.status === "received" && !changesRequested(o));
  const changes = orders.filter(changesRequested);
  const waitingProof = orders.filter((o) => o.status === "proof-sent");
  const shippedNoTracking = orders.filter((o) => o.status === "shipped" && !o.trackingUrl);

  const latestByCustomer = new Map<string, StoredOrder>();
  for (const order of orders) if (!latestByCustomer.has(order.customer.id)) latestByCustomer.set(order.customer.id, order);
  const reorder = [...latestByCustomer.values()]
    .filter((o) => now.getTime() - Date.parse(o.placedAt) > REORDER_AFTER_DAYS * DAY_MS)
    .slice(0, 4);

  const attention = [
    ...changes.map((o) => ({ order: o, tone: "warn", text: "Kunden vill ändra korrekturen" })),
    ...toHandle.slice(0, 5).map((o) => ({ order: o, tone: "info", text: `Ny order · ${badgeCount(o)} skyltar` })),
    ...waitingProof.map((o) => ({ order: o, tone: "info", text: "Väntar på kundens godkännande" })),
    ...shippedNoTracking.map((o) => ({ order: o, tone: "warn", text: "Skickad men saknar spårningslänk" })),
  ];

  return (
    <>
      <header className={styles.pageHead}>
        <div>
          <p className={styles.eyebrow}>
            {new Intl.DateTimeFormat("sv-SE", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Stockholm" }).format(now)}
          </p>
          <h1 className={styles.pageTitle}>{greeting(now)}</h1>
          <p className={styles.pageLead}>
            {toHandle.length > 0
              ? `${toHandle.length} ${toHandle.length === 1 ? "ny order väntar" : "nya ordrar väntar"} på dig.`
              : "Inga nya ordrar som väntar just nu."}
          </p>
        </div>
        <Link href="/admin/ordrar" className="btn btn--primary">
          Alla ordrar
        </Link>
      </header>

      <div className={styles.kpis}>
        <div className={styles.kpi} data-tone="navy">
          <span className={styles.kpiLabel}>Ordrar senaste 30 dagarna</span>
          <span className={styles.kpiValue}>{recent.length}</span>
          <span className={styles.kpiHint}>{recent.reduce((sum, o) => sum + badgeCount(o), 0)} skyltar</span>
          <Sparkline className={styles.spark} values={stats.weeks.map((w) => w.orders)} stroke="#9cc0ff" />
        </div>
        <div className={styles.kpi} data-tone="gold">
          <span className={styles.kpiLabel}>Ordervärde 30 dagar</span>
          <span className={styles.kpiValue}>{formatSek(recentRevenue)}</span>
          <span className={styles.kpiHint}>exkl. moms</span>
          <Sparkline className={styles.spark} values={stats.weeks.map((w) => w.revenueSek)} stroke="#6b4b00" />
        </div>
        <div className={styles.kpi}>
          <span className={styles.kpiLabel}>Snittorder</span>
          <span className={styles.kpiValue}>{formatSek(stats.averageOrderSek)}</span>
          <span className={styles.kpiHint}>{stats.orderCount} ordrar totalt</span>
        </div>
        <div className={styles.kpi}>
          <span className={styles.kpiLabel}>Återkommande kunder</span>
          <span className={styles.kpiValue}>{Math.round(stats.repeatCustomerShare * 100)} %</span>
          <span className={styles.kpiHint}>av {stats.customers} kunder</span>
        </div>
      </div>

      <div className={`${styles.twoCol} ${styles.section}`}>
        <section className={styles.panel}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>Kräver åtgärd</h2>
            <span className={styles.muted}>{attention.length} st</span>
          </div>
          {attention.length === 0 ? (
            <p className={styles.muted}>Allt är hanterat.</p>
          ) : (
            <ul className={styles.attention} role="list">
              {attention.slice(0, 7).map(({ order, tone, text }) => (
                <li key={`${order.orderNo}-${text}`}>
                  <Link href={`/admin/ordrar/${order.orderNo}`} className={styles.attentionItem} data-tone={tone}>
                    <span className={styles.attentionIcon} aria-hidden="true">
                      {tone === "warn" ? "!" : "•"}
                    </span>
                    <span>
                      <strong>{order.customer.company ?? order.customer.name}</strong>
                      <span className={styles.muted}> · {text}</span>
                    </span>
                    <span className="mono">{order.orderNo}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={styles.panel}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>Dags att beställa igen?</h2>
          </div>
          {reorder.length === 0 ? (
            <p className={styles.muted}>Alla kunder har beställt de senaste {REORDER_AFTER_DAYS} dagarna.</p>
          ) : (
            <ul className={styles.rows} role="list">
              {reorder.map((order) => (
                <li key={order.customer.id} className={styles.rowLink}>
                  <span className={styles.rowTitle}>
                    <strong>{order.customer.company ?? order.customer.name}</strong>
                    <span className={styles.muted}>Senast {formatRelative(order.placedAt, now)}</span>
                  </span>
                  <span />
                  <span />
                  <RepeatButton order={order} compact />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Senaste ordrar</h2>
          <Link href="/admin/ordrar" className={styles.link}>
            Visa alla →
          </Link>
        </div>
        <div className={styles.cards}>
          {orders.slice(0, 4).map((order) => (
            <OrderCard key={order.id} order={order} />
          ))}
        </div>
      </section>
    </>
  );
}
