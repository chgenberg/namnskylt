import { adminTenant } from "@/features/admin/guard";
import { PurchasePriceTable } from "@/features/admin/purchase-price-table";
import styles from "@/features/admin/admin.module.css";
import { getPriceModel } from "@/lib/orders/repository";

export default async function PurchasePricesPage() {
  const tenant = await adminTenant();
  if (!tenant) return null;
  return (
    <>
      <header className={styles.pageHead}>
        <div>
          <p className={styles.eyebrow}>Inköpspriser</p>
          <h1 className={styles.pageTitle}>Vad skyltarna kostar dig</h1>
          <p className={styles.pageLead}>
            Dina inköpspriser. Inköp och marginal visas i skyltmotorn när du gör en offert eller order åt en kund — aldrig för
            kunden.
          </p>
        </div>
      </header>
      <PurchasePriceTable model={await getPriceModel()} />
    </>
  );
}
