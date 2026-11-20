import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgePreview } from "@/components/badge-preview";
import { orderFromDesignAction } from "@/features/admin/actions";
import { DeleteCustomerButton } from "@/features/admin/delete-customer-button";
import { DeleteDesignButton } from "@/features/admin/delete-design-button";
import { adminTenant } from "@/features/admin/guard";
import { NewNamesButton } from "@/features/admin/new-names-button";
import { OrderRow } from "@/features/admin/order-row";
import { RepeatButton } from "@/features/admin/repeat-button";
import styles from "@/features/admin/admin.module.css";
import { formatDay, formatSek, plural } from "@/lib/format";
import { customerErasurePlan } from "@/lib/orders/erase";
import { isErasedCustomer } from "@/lib/orders/erase-model";
import { badgeCount } from "@/lib/orders/model";
import { getCustomer, listCustomerOrders, listDesigns } from "@/lib/orders/repository";
import { isOwner } from "@/lib/tenants/model";

interface CustomerPageProps {
  params: Promise<{ id: string }>;
}

export default async function CustomerPage({ params }: CustomerPageProps) {
  const tenant = await adminTenant();
  if (!tenant) return null;
  const { id } = await params;
  const customer = await getCustomer(tenant, id);
  if (!customer) notFound();
  const [orders, designs, erasure] = await Promise.all([
    listCustomerOrders(tenant, customer.id),
    listDesigns(tenant, customer.id),
    customerErasurePlan(tenant, customer.id),
  ]);
  // En borttagen kund står kvar för bokföringens skull: bara ordrarna visas, och inget nytt går att lägga.
  const erased = isErasedCustomer(customer);
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
          {erased ? (
            <p className={styles.pageLead}>
              Kundens uppgifter är borttagna. Ordrarna nedan behålls utan personuppgifter, eftersom de hör till bokföringen.
            </p>
          ) : (
            <p className={styles.pageLead}>
              {customer.name}
              {/* En kund som sparats med bara företagets namn, från en offert, har ingen e-post. */}
              {customer.email ? (
                <>
                  {" · "}
                  <a href={`mailto:${customer.email}`} className={styles.link}>
                    {customer.email}
                  </a>
                </>
              ) : (
                " · ingen e-post sparad"
              )}
            </p>
          )}
        </div>
        {!erased && (
          <div className={styles.actionBar}>
            <Link href={`/admin/ny-order?kund=${customer.id}`} className={styles.ghostButton}>
              + Ny order
            </Link>
            {latest && <RepeatButton order={latest} />}
            {erasure && <DeleteCustomerButton customerId={customer.id} name={title} plan={erasure} />}
          </div>
        )}
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

      {!erased && (
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
      )}

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Orderhistorik</h2>
          <span className={styles.muted}>{plural(orders.length, "order", "ordrar")}</span>
        </div>
        <div className={styles.listRows}>
          {orders.map((order) => (
            <OrderRow key={order.id} order={order} canDelete={isOwner(tenant)} />
          ))}
        </div>
      </section>
    </>
  );
}
