import { adminTenant } from "@/features/admin/guard";
import { StartOrderForm } from "@/features/admin/start-order-form";
import styles from "@/features/admin/admin.module.css";
import { isErasedCustomer } from "@/lib/orders/erase-model";
import { listCustomers } from "@/lib/orders/repository";

interface NewQuotePageProps {
  searchParams: Promise<{ kund?: string }>;
}

export default async function NewQuotePage({ searchParams }: NewQuotePageProps) {
  const tenant = await adminTenant();
  if (!tenant) return null;
  const { kund } = await searchParams;
  const customers = (await listCustomers(tenant))
    .filter((c) => !isErasedCustomer(c))
    .map((c) => ({
      id: c.id,
      label: c.company ?? c.name,
      detail: [c.company ? c.name : null, c.email, c.demo ? "demo" : null].filter(Boolean).join(" · "),
    }));

  return (
    <>
      <header className={styles.pageHead}>
        <div>
          <p className={styles.eyebrow}>Skapa offert</p>
          <h1 className={styles.pageTitle}>Ny offert</h1>
          <p className={styles.pageLead}>
            Fyll i kundens uppgifter och designa skyltarna i skyltmotorn. Lägg dem i varukorgen, en eller flera designer, och
            skapa offerten därifrån. Du prissätter och skickar den, och kunden godkänner med ett klick.
          </p>
        </div>
      </header>
      <StartOrderForm mode="quote" customers={customers} preselected={customers.some((c) => c.id === kund) ? kund : undefined} />
    </>
  );
}
