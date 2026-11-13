import { adminTenant } from "@/features/admin/guard";
import { ResellerOrders } from "@/features/admin/reseller-orders";
import styles from "@/features/admin/admin.module.css";
import { requireDb } from "@/lib/db/client";
import { listResellerOrders } from "@/lib/orders/provision-store";
import { getPriceModel } from "@/lib/orders/repository";
import { isOwner } from "@/lib/tenants/model";

export default async function ProvisionPage() {
  const tenant = await adminTenant();
  // Provisionen är namnskylt.coms — en återförsäljare får aldrig se sidan eller datat bakom den.
  if (!tenant || !isOwner(tenant)) return null;
  const rows = await listResellerOrders(requireDb(), await getPriceModel());
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
      </header>
      {rows.length === 0 ? (
        <div className={styles.empty}>
          <strong>Inga ordrar än</strong>
          <span>Ingen återförsäljare har lagt eller fått någon order.</span>
        </div>
      ) : (
        <ResellerOrders rows={rows} />
      )}
    </>
  );
}
