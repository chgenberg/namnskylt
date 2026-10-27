import { canViewAdmin } from "@/features/admin/guard";
import { StartOrderForm } from "@/features/admin/start-order-form";
import styles from "@/features/admin/admin.module.css";
import { listCustomers } from "@/lib/orders/repository";

interface NewQuotePageProps {
  searchParams: Promise<{ kund?: string }>;
}

export default async function NewQuotePage({ searchParams }: NewQuotePageProps) {
  if (!(await canViewAdmin())) return null;
  const { kund } = await searchParams;
  const customers = (await listCustomers()).map((c) => ({
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
            Fyll i kundens uppgifter och designa skyltarna i skyltmotorn som kunden själv skulle. I stället för en order blir det en
            offert som du prissätter, skickar och som kunden godkänner med ett klick.
          </p>
        </div>
      </header>
      <StartOrderForm mode="quote" customers={customers} preselected={customers.some((c) => c.id === kund) ? kund : undefined} />
    </>
  );
}
