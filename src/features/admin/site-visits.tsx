import type { SiteStats } from "@/lib/site-stats/repository";
import { plural } from "@/lib/format";
import styles from "./admin.module.css";

const DAY = new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "short", timeZone: "UTC" });
const dayLabel = (day: string) => DAY.format(new Date(`${day}T12:00:00Z`));

const SOURCE_LABEL: Record<string, string> = { direkt: "Direkt eller okänd", utskick: "Utskicket till återförsäljare" };
const DEVICE_LABEL: Record<string, string> = { dator: "Dator", telefon: "Telefon", surfplatta: "Surfplatta" };

/** Sajtens sidor med namn; andra sidor visas med sin adress. */
const PAGE_LABEL: Record<string, string> = {
  "/": "Startsidan",
  "/skapa": "Skyltmotorn",
  "/demo": "Sidan med filmen",
  "/inspiration": "Inspirationsbank",
  "/om-oss": "Om oss",
  "/kontakt": "Kontakta oss",
  "/foretag": "Företag",
  "/villkor": "Köpvillkor",
  "/integritet": "Integritetspolicy",
  "/aterforsaljare": "Inloggning för återförsäljare",
  "/aterforsaljare/ansok": "Ansökan för återförsäljare",
  "/konto": "Mitt konto",
  "/konto/logga-in": "Inloggning för kunder",
  "/offert/[kod]": "Offerter till kunder",
  "/order/[kod]": "Ordersidor till kunder",
};

function Bars({ rows, unit }: { rows: { label: string; value: number }[]; unit: [string, string] }) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  return (
    <div className={styles.bars}>
      {rows.map((row) => (
        <div key={row.label} className={styles.bar}>
          <div className={styles.barHead}>
            <span>{row.label}</span>
            <span className={styles.muted}>{plural(row.value, unit[0], unit[1])}</span>
          </div>
          <div className={styles.barTrack} aria-hidden="true">
            <div className={styles.barFill} style={{ width: `${Math.round((row.value / max) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Besökarna på namnskylt.com de senaste 30 dagarna, räknade utan kakor (beslut av ägaren 2026-11-25). En besökare
 * har en ny kod varje dygn, så samma person räknas en gång per dag. Panelen, butikerna och den som är inloggad i
 * panelen räknas inte.
 */
export function SiteVisits({ stats, today }: { stats: SiteStats; today: string }) {
  const todayRow = stats.perDay.find((row) => row.day === today);
  const lastWeek = stats.perDay.slice(-7).reduce((sum, row) => sum + row.visitors, 0);
  const recent = stats.perDay.slice(-14).reverse();
  return (
    <section className={`${styles.panel} ${styles.section}`}>
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>Besökare på namnskylt.com</h2>
        <span className={styles.muted}>Senaste {stats.days} dagarna, utan kakor</span>
      </div>
      {stats.views === 0 ? (
        <p className={styles.muted}>Inga besök räknade än. Räkningen började 25 november 2026.</p>
      ) : (
        <>
          <div className={styles.kpis}>
            <div className={styles.kpi}>
              <span className={styles.kpiLabel}>I dag</span>
              <span className={styles.kpiValue}>{todayRow?.visitors ?? 0}</span>
              <span className={styles.kpiHint}>{plural(todayRow?.views ?? 0, "sidvisning", "sidvisningar")}</span>
            </div>
            <div className={styles.kpi}>
              <span className={styles.kpiLabel}>Senaste 7 dagarna</span>
              <span className={styles.kpiValue}>{lastWeek}</span>
              <span className={styles.kpiHint}>besökare, en gång per dag</span>
            </div>
            <div className={styles.kpi}>
              <span className={styles.kpiLabel}>Senaste {stats.days} dagarna</span>
              <span className={styles.kpiValue}>{stats.visitorDays}</span>
              <span className={styles.kpiHint}>{plural(stats.views, "sidvisning", "sidvisningar")}</span>
            </div>
          </div>
          <div className={styles.siteVisitGrid}>
            <div>
              <h3 className={styles.subTitle}>Per dag</h3>
              <Bars rows={recent.map((row) => ({ label: dayLabel(row.day), value: row.visitors }))} unit={["besökare", "besökare"]} />
            </div>
            <div>
              <h3 className={styles.subTitle}>Mest besökta sidor</h3>
              <Bars rows={stats.pages.map((row) => ({ label: PAGE_LABEL[row.path] ?? row.path, value: row.views }))} unit={["visning", "visningar"]} />
            </div>
            <div>
              <h3 className={styles.subTitle}>Varifrån</h3>
              <Bars
                rows={stats.sources.map((row) => ({ label: SOURCE_LABEL[row.source] ?? row.source, value: row.visitors }))}
                unit={["besökare", "besökare"]}
              />
            </div>
            <div>
              <h3 className={styles.subTitle}>Enhet</h3>
              <Bars
                rows={stats.devices.map((row) => ({ label: DEVICE_LABEL[row.device] ?? row.device, value: row.visitors }))}
                unit={["besökare", "besökare"]}
              />
            </div>
          </div>
        </>
      )}
    </section>
  );
}
