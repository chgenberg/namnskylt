import Link from "next/link";
import { CustomerAccounts } from "@/features/admin/customer-accounts";
import { adminTenant } from "@/features/admin/guard";
import styles from "@/features/admin/admin.module.css";
import { formatRelative, formatSek, plural } from "@/lib/format";
import { isErasedCustomer } from "@/lib/orders/erase-model";
import { listCustomers } from "@/lib/orders/repository";
import { isOwner } from "@/lib/tenants/model";

export default async function CustomersPage() {
  const tenant = await adminTenant();
  if (!tenant) return null;
  // En borttagen kund står bara kvar för bokföringens skull och visas inte här.
  const customers = (await listCustomers(tenant)).filter((customer) => !isErasedCustomer(customer));

  return (
    <>
      <header className={styles.pageHead}>
        <div>
          <p className={styles.eyebrow}>Kunder</p>
          <h1 className={styles.pageTitle}>{plural(customers.length, "kund", "kunder")}</h1>
          <p className={styles.pageLead}>Varje kund har sin orderhistorik och sina sparade skyltmallar.</p>
        </div>
      </header>
      {/* Rader i stället för kort, med företagets namn längst till vänster (besked via ägaren 2026-11-20). */}
      <div className={styles.listRows} data-kind="customers">
        {/* Rubrikraden syns bara i återförsäljarens panel, som har tabellerna (besked av ägaren 2026-11-23). */}
        {!isOwner(tenant) && customers.length > 0 && (
          <div className={styles.listHead} aria-hidden="true">
            <span>Kund</span>
            <span>Senaste order</span>
            <span>Ordrar</span>
            <span>Skyltar</span>
            <span data-end>Försäljning</span>
          </div>
        )}
        {customers.map((c) => (
          <Link key={c.id} href={`/admin/kunder/${c.id}`} className={styles.listRow}>
            <span className={styles.rowMain}>
              <strong className={styles.rowName}>{c.company ?? c.name}</strong>
              <span className={styles.cardMeta}>
                {[c.company && c.name !== c.company ? c.name : null, c.email].filter(Boolean).join(" · ") || "Ingen kontakt sparad"}
              </span>
            </span>
            <span className={styles.rowTail}>
              <span className={styles.rowFact}>
                {c.lastOrderAt ? `Senaste order ${formatRelative(c.lastOrderAt)}` : "Inga ordrar än"}
                {c.designs > 0 && ` · ${plural(c.designs, "mall", "mallar")}`}
              </span>
              <span className={styles.rowFact}>{plural(c.orders, "order", "ordrar")}</span>
              <span className={styles.rowFact}>{plural(c.badges, "skylt", "skyltar")}</span>
              <span className={styles.amount}>{formatSek(c.revenueSek)}</span>
            </span>
          </Link>
        ))}
      </div>
      <CustomerAccounts tenant={tenant} />
    </>
  );
}
