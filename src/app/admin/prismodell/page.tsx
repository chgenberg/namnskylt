import { notFound } from "next/navigation";
import Link from "next/link";
import { adminTenant } from "@/features/admin/guard";
import { LazyPriceModelEditor } from "@/features/admin/price-model-editor-lazy";
import styles from "@/features/admin/admin.module.css";
import { getPriceModel } from "@/lib/orders/repository";
import { isOwner } from "@/lib/tenants/model";

export default async function PriceModelPage() {
  const tenant = await adminTenant();
  // Prismodellen är namnskylt.coms — återförsäljarna ser sina inköpspriser på en egen sida.
  if (!tenant) return null;
  if (!isOwner(tenant)) notFound();
  return (
    <>
      <header className={styles.pageHead}>
        <div>
          <p className={styles.eyebrow}>Prismodell</p>
          <h1 className={styles.pageTitle}>Priser, provision och marginal</h1>
          <p className={styles.pageLead}>
            Ändra siffrorna och se direkt vad återförsäljaren betalar, vad Skylt &amp; Gravyrteknik får, er provision och
            slutkundens pris.
          </p>
        </div>
        <Link href="/admin/inkopspriser" className="btn btn--ghost">
          Så ser återförsäljaren priserna
        </Link>
      </header>
      <LazyPriceModelEditor model={await getPriceModel()} />
    </>
  );
}
