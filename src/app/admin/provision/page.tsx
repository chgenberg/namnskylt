import Link from "next/link";
import { adminTenant } from "@/features/admin/guard";
import { ResellerOrders } from "@/features/admin/reseller-orders";
import styles from "@/features/admin/admin.module.css";
import { requireDb } from "@/lib/db/client";
import { inPeriod, PERIOD_PATTERN, periodLabel, periodsOf } from "@/lib/orders/provision";
import { listResellerOrders } from "@/lib/orders/provision-store";
import { getPriceModel } from "@/lib/orders/repository";
import { isOwner } from "@/lib/tenants/model";

interface ProvisionPageProps {
  searchParams: Promise<{ period?: string }>;
}

export default async function ProvisionPage({ searchParams }: ProvisionPageProps) {
  const tenant = await adminTenant();
  // Provisionen är namnskylt.coms — en återförsäljare får aldrig se sidan eller datat bakom den.
  if (!tenant || !isOwner(tenant)) return null;
  const all = await listResellerOrders(requireDb(), await getPriceModel());
  const { period: asked } = await searchParams;
  const period = asked && PERIOD_PATTERN.test(asked) ? asked : null;
  const rows = inPeriod(all, period);
  const periods = periodsOf(all);
  return (
    <>
      <header className={styles.pageHead}>
        <div>
          <p className={styles.eyebrow}>Provision</p>
          <h1 className={styles.pageTitle}>Återförsäljarnas ordrar</h1>
          <p className={styles.pageLead}>
            Alla ordrar som återförsäljarna har lagt eller fått i sina butiker: vad återförsäljaren betalar, er provision och
            vad som går till Skylt &amp; Gravyrteknik. Varje order räknas med prismodellen som gällde när den lades.
            Demoordrar och avbrutna ordrar är inte med.
          </p>
        </div>
        {rows.length > 0 && (
          <div className={styles.actionBar}>
            <a href={`/api/admin/provision/export${period ? `?period=${period}` : ""}`} className={styles.ghostButton}>
              Ladda ner underlag (CSV)
            </a>
          </div>
        )}
      </header>
      {periods.length > 0 && (
        <nav className={styles.filters} aria-label="Period" style={{ marginBottom: "var(--space-4)" }}>
          <Link href="/admin/provision" className={styles.filter} aria-current={period === null ? "page" : undefined}>
            Alla
          </Link>
          {periods.map((month) => (
            <Link
              key={month}
              href={`/admin/provision?period=${month}`}
              className={styles.filter}
              aria-current={period === month ? "page" : undefined}
            >
              {periodLabel(month)}
            </Link>
          ))}
        </nav>
      )}
      {rows.length === 0 ? (
        <div className={styles.empty}>
          <strong>{period ? `Inga ordrar i ${periodLabel(period)}` : "Inga ordrar än"}</strong>
          <span>{period ? "Välj en annan månad." : "Ingen återförsäljare har lagt eller fått någon order."}</span>
        </div>
      ) : (
        <ResellerOrders rows={rows} />
      )}
    </>
  );
}
