import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgePreview } from "@/components/badge-preview";
import { orderFromDesignAction } from "@/features/admin/actions";
import { DeleteDesignButton } from "@/features/admin/delete-design-button";
import { canViewAdmin } from "@/features/admin/guard";
import { NewNamesButton } from "@/features/admin/new-names-button";
import { OrderCard } from "@/features/admin/order-card";
import { RepeatButton } from "@/features/admin/repeat-button";
import styles from "@/features/admin/admin.module.css";
import { formatDay, formatSek } from "@/features/orders/format";
import { badgeCount } from "@/lib/orders/model";
import { getCustomer, listCustomerOrders, listDesigns } from "@/lib/orders/repository";

interface CustomerPageProps {
  params: Promise<{ id: string }>;
}

export default async function CustomerPage({ params }: CustomerPageProps) {
  if (!(await canViewAdmin())) return null;
  const { id } = await params;
  const customer = await getCustomer(id);
  if (!customer) notFound();
  const [orders, designs] = await Promise.all([listCustomerOrders(customer.id), listDesigns(customer.id)]);
  const counted = orders.filter((o) => o.status !== "cancelled");
  const revenue = counted.reduce((sum, o) => sum + o.totalSek, 0);
  const latest = orders[0];
  const title = customer.company ?? customer.name;

  return (
    <>
      <header className={styles.pageHead}>
        <div>
          <p className={styles.eyebrow}>
            <Link href="/admin/kunder" className={styles.link}>
              Kunder
            </Link>{" "}
            / {title}
          </p>
          <h1 className={styles.pageTitle}>{title}</h1>
          <p className={styles.pageLead}>
            {customer.name} ·{" "}
            <a href={`mailto:${customer.email}`} className={styles.link}>
              {customer.email}
            </a>
          </p>
        </div>
        {latest && <RepeatButton order={latest} />}
      </header>

      <div className={styles.kpis}>
        <div className={styles.kpi} data-tone="navy">
          <span className={styles.kpiLabel}>Ordrar</span>
          <span className={styles.kpiValue}>{counted.length}</span>
          <span className={styles.kpiHint}>{latest ? `senast ${formatDay(latest.placedAt)}` : "inga än"}</span>
        </div>
        <div className={styles.kpi}>
          <span className={styles.kpiLabel}>Skyltar</span>
          <span className={styles.kpiValue}>{counted.reduce((sum, o) => sum + badgeCount(o), 0)}</span>
        </div>
        <div className={styles.kpi} data-tone="gold">
          <span className={styles.kpiLabel}>Totalt exkl. moms</span>
          <span className={styles.kpiValue}>{formatSek(revenue)}</span>
        </div>
      </div>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Designbibliotek</h2>
          <span className={styles.muted}>Spara en skylt som mall från en order — sedan räcker det att skriva namnen.</span>
        </div>
        {designs.length === 0 ? (
          <div className={styles.empty}>
            <strong>Inga mallar än</strong>
            <span>Öppna en order och välj ”Spara som mall” på en skylt.</span>
          </div>
        ) : (
          <div className={styles.designGrid}>
            {designs.map((design) => (
              <figure key={design.id} className={styles.badgeTile}>
                <BadgePreview doc={design.doc} label={`Mall: ${design.name}`} />
                <figcaption className={styles.form}>
                  <strong>{design.name}</strong>
                  <div className={styles.badgeTileMeta}>
                    <NewNamesButton
                      template={design.doc}
                      title={`Ny order från ”${design.name}”`}
                      label="Ny order"
                      variant="primary"
                      submit={orderFromDesignAction.bind(null, design.id)}
                    />
                    <DeleteDesignButton designId={design.id} name={design.name} />
                  </div>
                </figcaption>
              </figure>
            ))}
          </div>
        )}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Orderhistorik</h2>
          <span className={styles.muted}>{orders.length} ordrar</span>
        </div>
        <div className={styles.cards}>
          {orders.map((order) => (
            <OrderCard key={order.id} order={order} />
          ))}
        </div>
      </section>
    </>
  );
}
