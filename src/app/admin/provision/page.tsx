import Link from "next/link";
import { adminTenant } from "@/features/admin/guard";
import { ResellerOrders } from "@/features/admin/reseller-orders";
import styles from "@/features/admin/admin.module.css";
import { requireDb } from "@/lib/db/client";
import { exampleResellerOrders, inPeriod, PERIOD_PATTERN, periodLabel, periodsOf } from "@/lib/orders/provision";
import { listResellerOrders } from "@/lib/orders/provision-store";
import { getPriceModel } from "@/lib/orders/repository";
import { isOwner } from "@/lib/tenants/model";

interface ProvisionPageProps {
  searchParams: Promise<{ period?: string; exempel?: string }>;
}

const PAGE_PATH = "/admin/provision";

export default async function ProvisionPage({ searchParams }: ProvisionPageProps) {
  const tenant = await adminTenant();
  // Provisionen är namnskylt.coms — en återförsäljare får aldrig se sidan eller datat bakom den.
  if (!tenant || !isOwner(tenant)) return null;
  const model = await getPriceModel();
  const real = await listResellerOrders(requireDb(), model);
  const { period: asked, exempel } = await searchParams;
  // Påhittade ordrar visar hur fördelningen räknas. De visas tills den första riktiga ordern finns,
  // och går sedan att ta fram med `?exempel=1`. De blandas aldrig med riktiga ordrar.
  const examples = real.length === 0 || exempel === "1";
  const all = examples ? exampleResellerOrders(model, new Date()) : real;
  const period = asked && PERIOD_PATTERN.test(asked) ? asked : null;
  const rows = inPeriod(all, period);
  const periods = periodsOf(all);
  // Med riktiga ordrar är exemplen ett val som ska följa med när månaden byts.
  const chosenExamples = examples && real.length > 0;
  const pageHref = (month: string | null) => {
    const query = [month && `period=${month}`, chosenExamples && "exempel=1"].filter(Boolean).join("&");
    return query ? `${PAGE_PATH}?${query}` : PAGE_PATH;
  };
  return (
    <>
      <header className={styles.pageHead}>
        <div>
          <p className={styles.eyebrow}>Provision</p>
          <h1 className={styles.pageTitle}>Ordrar och provision</h1>
          <p className={styles.pageLead}>
            Alla ordrar som Skylt &amp; Gravyrteknik fakturerar: vad som faktureras, er provision och vad som går till
            verkstaden. En återförsäljares order faktureras återförsäljaren, och ni får trappstegens provision. En order
            direkt hos namnskylt.com faktureras kunden, och ni får prismodellens marginal. Varje order räknas med
            prismodellen som gällde när den lades. Demoordrar och avbrutna ordrar är inte med.
          </p>
        </div>
        <div className={styles.actionBar}>
          {real.length > 0 && (
            <Link href={chosenExamples ? PAGE_PATH : `${PAGE_PATH}?exempel=1`} className={styles.ghostButton}>
              {chosenExamples ? "Visa riktiga ordrar" : "Visa exempel"}
            </Link>
          )}
          {!examples && rows.length > 0 && (
            <a href={`/api/admin/provision/export${period ? `?period=${period}` : ""}`} className={styles.ghostButton}>
              Ladda ner underlag (CSV)
            </a>
          )}
        </div>
      </header>
      {examples && (
        <div className={styles.callout} data-tone="warn" role="note" style={{ marginBottom: "var(--space-4)" }}>
          <strong>Exempel, inga riktiga ordrar</strong>
          <span>
            Ordrarna nedan är påhittade och räknade med dagens prismodell, så att det går att se att fördelningen blir rätt:
            minsta ordervärde, gränsen mellan varubrev och paket, 25 skyltar som i prismodellens kalkyl och ordrar över
            flera trappsteg. {real.length === 0 ? "De försvinner när den första riktiga ordern finns. " : ""}
            De finns inte i databasen och är inte med i underlaget.
          </span>
        </div>
      )}
      {periods.length > 0 && (
        <nav className={styles.filters} aria-label="Period" style={{ marginBottom: "var(--space-4)" }}>
          <Link href={pageHref(null)} className={styles.filter} aria-current={period === null ? "page" : undefined}>
            Alla
          </Link>
          {periods.map((month) => (
            <Link
              key={month}
              href={pageHref(month)}
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
