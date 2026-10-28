import { adminTenant } from "@/features/admin/guard";
import { PurchaseTermsForm } from "@/features/admin/purchase-terms-form";
import styles from "@/features/admin/admin.module.css";
import { getPurchaseTerms } from "@/lib/orders/repository";

export default async function PurchasePricesPage() {
  const tenant = await adminTenant();
  if (!tenant) return null;
  const terms = await getPurchaseTerms(tenant);
  return (
    <>
      <header className={styles.pageHead}>
        <div>
          <p className={styles.eyebrow}>Inköpspriser</p>
          <h1 className={styles.pageTitle}>Vad skyltarna kostar dig</h1>
          <p className={styles.pageLead}>
            Din rabatt hos Skylt &amp; Gravyrteknik. Inköp och marginal visas i skyltmotorn när du gör en offert eller order åt en
            kund — aldrig för kunden.
          </p>
        </div>
      </header>
      <section className={styles.panel}>
        <PurchaseTermsForm terms={terms} />
      </section>
    </>
  );
}
