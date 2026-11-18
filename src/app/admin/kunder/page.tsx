import Link from "next/link";
import { CustomerAccounts } from "@/features/admin/customer-accounts";
import { adminTenant } from "@/features/admin/guard";
import styles from "@/features/admin/admin.module.css";
import { formatRelative, formatSek, plural } from "@/lib/format";
import { isErasedCustomer } from "@/lib/orders/erase-model";
import { listCustomers } from "@/lib/orders/repository";

function initials(text: string): string {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}

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
      <div className={styles.customerGrid}>
        {customers.map((c) => (
          <Link key={c.id} href={`/admin/kunder/${c.id}`} className={styles.customerCard}>
            <div className={styles.customerHead}>
              <span className={styles.avatar} aria-hidden="true">
                {initials(c.company ?? c.name)}
              </span>
              <span className={styles.rowTitle}>
                <strong>{c.company ?? c.name}</strong>
                <span className={styles.muted}>{c.company ? c.name : c.email}</span>
              </span>
            </div>
            <span className={styles.muted}>
              {c.lastOrderAt ? `Senaste order ${formatRelative(c.lastOrderAt)}` : "Inga ordrar än"}
              {c.designs > 0 && ` · ${c.designs} ${c.designs === 1 ? "mall" : "mallar"}`}
            </span>
            <div className={styles.customerStats}>
              <div>
                <strong>{c.orders}</strong>
                <span>{c.orders === 1 ? "order" : "ordrar"}</span>
              </div>
              <div>
                <strong>{c.badges}</strong>
                <span>{c.badges === 1 ? "skylt" : "skyltar"}</span>
              </div>
              <div>
                <strong>{formatSek(c.revenueSek)}</strong>
                <span>totalt</span>
              </div>
            </div>
          </Link>
        ))}
      </div>
      <CustomerAccounts tenant={tenant} />
    </>
  );
}
