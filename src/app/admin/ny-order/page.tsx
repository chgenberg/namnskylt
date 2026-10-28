import { adminTenant } from "@/features/admin/guard";
import { StartOrderForm } from "@/features/admin/start-order-form";
import styles from "@/features/admin/admin.module.css";
import { listCustomers } from "@/lib/orders/repository";

interface NewOrderPageProps {
  searchParams: Promise<{ kund?: string }>;
}

export default async function NewOrderPage({ searchParams }: NewOrderPageProps) {
  const tenant = await adminTenant();
  if (!tenant) return null;
  const { kund } = await searchParams;
  const customers = (await listCustomers(tenant)).map((c) => ({
    id: c.id,
    label: c.company ?? c.name,
    detail: [c.company ? c.name : null, c.email, c.demo ? "demo" : null].filter(Boolean).join(" · "),
  }));

  return (
    <>
      <header className={styles.pageHead}>
        <div>
          <p className={styles.eyebrow}>Skapa order</p>
          <h1 className={styles.pageTitle}>Ny order</h1>
          <p className={styles.pageLead}>
            Välj kund, så öppnas samma designer som kunderna använder. Ordern läggs direkt på kunden — inget namn eller
            e-post att fylla i i kassan.
          </p>
        </div>
      </header>
      <StartOrderForm customers={customers} preselected={customers.some((c) => c.id === kund) ? kund : undefined} />
    </>
  );
}
