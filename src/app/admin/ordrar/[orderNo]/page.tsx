import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgePreview } from "@/components/badge-preview";
import { engravedRows, getColor, getMaterial, getMounting, SHAPES } from "@/engine";
import { staffOrderAction } from "@/features/admin/actions";
import { canViewAdmin } from "@/features/admin/guard";
import { NewNamesButton } from "@/features/admin/new-names-button";
import { OrderTimeline } from "@/features/admin/order-timeline";
import { ProofPanel } from "@/features/admin/proof-panel";
import { RepeatButton } from "@/features/admin/repeat-button";
import { SaveDesignButton } from "@/features/admin/save-design-button";
import { StatusForm } from "@/features/admin/status-form";
import { StatusPill } from "@/features/admin/status-pill";
import styles from "@/features/admin/admin.module.css";
import { formatDate, formatSek } from "@/features/orders/format";
import { siteOrigin } from "@/lib/http/origin";
import { badgeCount, ORDER_SOURCE_LABEL } from "@/lib/orders/model";
import { getOrder, latestProof } from "@/lib/orders/repository";

interface OrderPageProps {
  params: Promise<{ orderNo: string }>;
}

export default async function OrderPage({ params }: OrderPageProps) {
  if (!(await canViewAdmin())) return null;
  const { orderNo } = await params;
  const order = await getOrder(decodeURIComponent(orderNo));
  if (!order) notFound();
  const [proof, origin] = await Promise.all([latestProof(order.orderNo), siteOrigin()]);
  const template = order.badges[0];
  const customerName = order.customer.company ?? order.customer.name;

  return (
    <>
      <header className={styles.pageHead}>
        <div>
          <p className={styles.eyebrow}>
            <Link href="/admin/ordrar" className={styles.link}>
              Ordrar
            </Link>{" "}
            / <span className="mono">{order.orderNo}</span> · {ORDER_SOURCE_LABEL[order.source]}
          </p>
          <h1 className={styles.pageTitle}>{customerName}</h1>
          <p className={styles.pageLead}>
            <StatusPill status={order.status} /> &nbsp;{badgeCount(order)} skyltar · {formatSek(order.totalSek)} exkl. moms ·
            lagd {formatDate(order.placedAt)}
          </p>
        </div>
        <div className={styles.actionBar}>
          <RepeatButton order={order} />
          {template && (
            <NewNamesButton
              template={template}
              title={`Ny personal hos ${customerName}`}
              label="Ny personal"
              submit={staffOrderAction.bind(null, order.orderNo)}
            />
          )}
        </div>
      </header>

      <div className={styles.detail}>
        <div className={styles.detailSide}>
          <section className={styles.panel}>
            <div className={styles.sectionHead}>
              <h2 className={styles.sectionTitle}>Skyltar</h2>
              <span className={styles.muted}>
                {order.badges.length} namn · {badgeCount(order)} st
              </span>
            </div>
            <div className={styles.badgeGrid}>
              {order.badges.map((badge, i) => {
                const name = engravedRows(badge)[0]?.text.trim() || "Utan namn";
                return (
                  <figure key={i} className={styles.badgeTile}>
                    <BadgePreview doc={badge} label={`Skylt: ${name}`} />
                    <figcaption className={styles.badgeTileMeta}>
                      <span>
                        {badge.quantity} st · {badge.size.widthMm}×{badge.size.heightMm}
                      </span>
                      <SaveDesignButton orderNo={order.orderNo} badgeIndex={i} defaultName={`${customerName} – ${name}`} />
                    </figcaption>
                  </figure>
                );
              })}
            </div>
          </section>

          <section className={styles.panel}>
            <h2 className={styles.sectionTitle}>Detaljer</h2>
            <dl className={`${styles.facts} ${styles.section}`} style={{ marginTop: "var(--space-3)" }}>
              <dt>Kund</dt>
              <dd>
                <Link href={`/admin/kunder/${order.customer.id}`} className={styles.link}>
                  {order.customer.name}
                </Link>
              </dd>
              <dt>E-post</dt>
              <dd>
                <a href={`mailto:${order.customer.email}`} className={styles.link}>
                  {order.customer.email}
                </a>
              </dd>
              {template && (
                <>
                  <dt>Material</dt>
                  <dd>
                    {getMaterial(template.materialId).name} · {getColor(template.materialId, template.colorId).name}
                  </dd>
                  <dt>Form och fäste</dt>
                  <dd>
                    {SHAPES.find((s) => s.id === template.shape)?.name} · {getMounting(template.mounting).name}
                  </dd>
                </>
              )}
              <dt>Belopp</dt>
              <dd>
                {formatSek(order.totalSek)} exkl. · {formatSek(order.totalInclVatSek)} inkl. moms
              </dd>
              {order.supplierOrderNo && (
                <>
                  <dt>Tillverkarens nr</dt>
                  <dd className="mono">{order.supplierOrderNo}</dd>
                </>
              )}
              {order.partnerRequestNo && (
                <>
                  <dt>Partnerförfrågan</dt>
                  <dd className="mono">{order.partnerRequestNo}</dd>
                </>
              )}
              {order.repeatOfOrderNo && (
                <>
                  <dt>Kopia av</dt>
                  <dd>
                    <Link href={`/admin/ordrar/${order.repeatOfOrderNo}`} className={`${styles.link} mono`}>
                      {order.repeatOfOrderNo}
                    </Link>
                  </dd>
                </>
              )}
              {order.trackingUrl && (
                <>
                  <dt>Spårning</dt>
                  <dd>
                    <a href={order.trackingUrl} target="_blank" rel="noreferrer" className={styles.link}>
                      Följ paketet ↗
                    </a>
                  </dd>
                </>
              )}
            </dl>
          </section>
        </div>

        <div className={styles.detailSide}>
          <section className={styles.panel}>
            <h2 className={styles.sectionTitle} style={{ marginBottom: "var(--space-4)" }}>
              Tidslinje
            </h2>
            <OrderTimeline order={order} />
          </section>
          <section className={styles.panel}>
            <h2 className={styles.sectionTitle} style={{ marginBottom: "var(--space-3)" }}>
              Uppdatera status
            </h2>
            <StatusForm key={`${order.status}-${order.events.length}`} order={order} />
          </section>
          <section className={styles.panel}>
            <h2 className={styles.sectionTitle} style={{ marginBottom: "var(--space-3)" }}>
              Korrektur
            </h2>
            <ProofPanel orderNo={order.orderNo} proof={proof} origin={origin} />
          </section>
        </div>
      </div>
    </>
  );
}
