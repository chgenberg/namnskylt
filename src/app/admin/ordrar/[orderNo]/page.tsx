import { packingSlipPath } from "@/lib/orders/packing-slip";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Fragment } from "react";
import { BadgePreview } from "@/components/badge-preview";
import { engravedRows, getColor, getMaterial, frameLabel, mountingLabel, orderDesigns, printColorLabel, shapeLabel, type BadgeDocument } from "@/engine";
import { shippingMethodOf } from "@/lib/orders/delivery";
import { staffOrderAction, updateOrderPricingAction } from "@/features/admin/actions";
import { PricingEditor } from "@/features/admin/pricing-editor";
import { adminTenant } from "@/features/admin/guard";
import { DeleteOrderButton } from "@/features/admin/delete-order-button";
import { DeliveryPanel } from "@/features/admin/delivery-panel";
import { LogoOriginalLinks } from "@/features/admin/logo-original-links";
import { NewNamesButton } from "@/features/admin/new-names-button";
import { NoticesSeen } from "@/features/admin/notices-seen";
import { OrderTimeline } from "@/features/admin/order-timeline";
import { ProofPanel } from "@/features/admin/proof-panel";
import { RepeatButton } from "@/features/admin/repeat-button";
import { SaveDesignButton } from "@/features/admin/save-design-button";
import { StatusPill } from "@/features/admin/status-pill";
import styles from "@/features/admin/admin.module.css";
import { formatDate, formatSek, plural } from "@/lib/format";
import { siteOrigin } from "@/lib/http/origin";
import { countUnreadNotices } from "@/lib/notices/repository";
import { deliveryOptions } from "@/lib/orders/delivery-options";
import { isErasedCustomer } from "@/lib/orders/erase-model";
import { badgeCount, isDirectOrder, ORDER_SOURCE_LABEL } from "@/lib/orders/model";
import { getOrder, latestProof } from "@/lib/orders/repository";
import { paymentLabel } from "@/lib/payments/model";
import { dispatchStatus, partyFor } from "@/lib/supplier/dispatch";
import { atPrinter, refreshFromSupplier, supplierLink, type SupplierLink } from "@/lib/supplier/sync";
import { isOwner } from "@/lib/tenants/model";

const SYNC_NOTE: Record<SupplierLink, string> = {
  connected: "Följer verkstaden automatiskt",
  "not-configured": "Verkstaden är inte ansluten ännu — statusen uppdateras när kopplingen är på plats",
  "not-sent": "Ordern har inte gått till verkstaden än",
  demo: "Demoorder — följer inte verkstaden",
};

interface OrderPageProps {
  params: Promise<{ orderNo: string }>;
}

/** "Metall · Mässing": materialet och ytan eller färgen. */
function materialText(badge: BadgeDocument): string {
  return `${getMaterial(badge.materialId).name} · ${getColor(badge.materialId, badge.colorId).name}`;
}

/** "Rektangel · Magnet · Tryckfärg #0057B8": formen, fästet och tryckets färg när den gäller. */
function shapeText(badge: BadgeDocument): string {
  const print = printColorLabel(badge);
  const frame = frameLabel(badge);
  return `${shapeLabel(badge)} · ${mountingLabel(badge)}${frame ? ` · ${frame}` : ""}${print ? ` · ${print}` : ""}`;
}

export default async function OrderPage({ params }: OrderPageProps) {
  const tenant = await adminTenant();
  if (!tenant) return null;
  const { orderNo } = await params;
  const orderNumber = decodeURIComponent(orderNo);
  const stored = await getOrder(tenant, orderNumber);
  if (!stored) notFound();
  const order = (await refreshFromSupplier(stored)) ? ((await getOrder(tenant, orderNumber)) ?? stored) : stored;
  const link = supplierLink(order);
  const [proof, origin, addresses, unread] = await Promise.all([
    latestProof(tenant, order.orderNo),
    siteOrigin(),
    deliveryOptions(tenant, order.customer),
    countUnreadNotices(tenant, { orderNo: order.orderNo }),
  ]);
  // Har ordern inte gått till verkstaden står skälet under tidslinjens rubrik, så att den som äger ordern vet vad som saknas.
  const dispatch = link === "not-sent" && order.status !== "cancelled" ? dispatchStatus(order, await partyFor(order)) : null;
  const waitReasons =
    dispatch?.state === "blocked"
      ? dispatch.problems.map((problem) => (isOwner(tenant) ? problem : problem.replace(/^Återförsäljarens /, "Ert företags ")))
      : dispatch?.state === "failed"
        ? ["Senaste försöket att skicka ordern gick inte igenom. Det provas igen av sig självt."]
        : dispatch?.state === "waiting"
          ? ["Ordern väntar på att skickas."]
          : [];
  const fixHint = dispatch?.state === "blocked" && !isOwner(tenant) && dispatch.problems.some((problem) => problem.startsWith("Återförsäljarens "));
  // Den som ändrar adressen efter utskicket är verkstaden. En återförsäljare går via namnskylt.com.
  const deliveryLocked = order.supplierSentAt
    ? `Ordern har gått till verkstaden. Hör av dig till ${isOwner(tenant) ? "Skylt & Gravyrteknik" : "namnskylt.com"} om adressen ska ändras.`
    : order.status === "cancelled"
      ? "Ordern är avbruten."
      : null;
  // En order kan ha flera designer, till exempel metall och plast. Detaljerna visar alla, inte bara den första.
  const designs = orderDesigns(order.badges);
  /** Mallen för "Ny personal": orderns första skylt. */
  const template = order.badges[0];
  // namnskylt.coms egna ordrar fakturerar verkstaden kunden för, till det här priset.
  const direct = isOwner(tenant) && isDirectOrder(order);
  const customerName = order.customer.company ?? order.customer.name;
  // En borttagen kund får inga nya ordrar eller mallar; ordern står bara kvar för bokföringen.
  const erased = isErasedCustomer(order.customer);

  return (
    <>
      {unread > 0 && <NoticesSeen target={{ orderNo: order.orderNo }} />}
      <header className={styles.pageHead}>
        <div>
          <p className={styles.eyebrow}>
            <Link href="/admin/ordrar" className={styles.link}>
              Ordrar
            </Link>{" "}
            / <span className="mono">{order.orderNo}</span> · {ORDER_SOURCE_LABEL[order.source]}
            {order.project && <> · {customerName}</>}
            {order.demo && <span className={styles.demoTag}> Demo</span>}
          </p>
          <h1 className={styles.pageTitle}>{order.project ?? customerName}</h1>
          <p className={styles.pageLead}>
            <StatusPill status={order.status} /> &nbsp;{plural(badgeCount(order), "skylt", "skyltar")} · {formatSek(order.totalSek)} exkl. moms ·
            lagd {formatDate(order.placedAt)}
          </p>
        </div>
        <div className={styles.actionBar}>
          {!erased && <RepeatButton order={order} />}
          {template && !erased && (
            <NewNamesButton
              template={template}
              title={`Ny personal hos ${customerName}`}
              label="Ny personal"
              submit={staffOrderAction.bind(null, order.orderNo)}
              shippingMethod={shippingMethodOf(order.delivery)}
            />
          )}
          {/* Bara admin tar bort ordrar. En återförsäljare kan inte det (besked via ägaren 2026-11-20). */}
          {isOwner(tenant) && (
            <DeleteOrderButton
              orderNo={order.orderNo}
              customerName={customerName}
              badgeCount={badgeCount(order)}
              totalSek={order.totalSek}
              atPrinter={atPrinter(order)}
              redirectTo="/admin/ordrar"
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
            {order.hasBadgeShot && (
              <div className={styles.shotHero}>
                {/* eslint-disable-next-line @next/next/no-img-element -- privat bild bakom inloggningen */}
                <img src={`/api/admin/orders/${order.orderNo}/shot`} alt="Skylten i 3D" />
              </div>
            )}
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
                      {!erased && <SaveDesignButton orderNo={order.orderNo} badgeIndex={i} defaultName={`${customerName} – ${name}`} />}
                    </figcaption>
                  </figure>
                );
              })}
            </div>
            <LogoOriginalLinks badges={order.badges} />
          </section>

          <section className={styles.panel}>
            <div className={styles.sectionHead}>
              <h2 className={styles.sectionTitle}>Pris</h2>
              <span className={styles.muted}>
                {direct
                  ? "Kundens pris, som Skylt & Gravyrteknik fakturerar. Det går inte att ändra när ordern har gått till verkstaden."
                  : "Ditt pris till kunden — påverkar fakturaunderlaget, inte tillverkningen"}
              </span>
            </div>
            <PricingEditor
              priceList={order.priceList}
              purchaseList={order.purchaseList}
              shippingSek={order.shippingSek}
              badges={order.badges}
              pricing={order.pricing}
              submit={order.status === "cancelled" ? undefined : updateOrderPricingAction.bind(null, order.orderNo)}
            />
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
              {!erased && (
                <>
                  <dt>E-post</dt>
                  <dd>
                    <a href={`mailto:${order.customer.email}`} className={styles.link}>
                      {order.customer.email}
                    </a>
                  </dd>
                </>
              )}
              {designs.length === 1 && designs[0] && (
                <>
                  <dt>Material</dt>
                  <dd>{materialText(designs[0].doc)}</dd>
                  <dt>Form och fäste</dt>
                  <dd>{shapeText(designs[0].doc)}</dd>
                </>
              )}
              {designs.length > 1 &&
                designs.map((design, i) => (
                  <Fragment key={i}>
                    <dt>
                      Design {i + 1}, {design.count} st
                    </dt>
                    <dd>
                      {materialText(design.doc)} · {shapeText(design.doc)}
                    </dd>
                  </Fragment>
                ))}
              <dt>Belopp</dt>
              <dd>
                {formatSek(order.totalSek)} exkl. · {formatSek(order.totalInclVatSek)} inkl. moms
              </dd>
              {order.customerPo && (
                <>
                  <dt>Inköpsnummer</dt>
                  <dd>{order.customerPo}</dd>
                </>
              )}
              <dt>Kundens ordersida</dt>
              <dd>
                <a href={`/order/${order.customerToken}`} target="_blank" rel="noreferrer" className={styles.link}>
                  Öppna ↗
                </a>{" "}
                <span className={styles.muted}>Länken går att skicka till kunden, som följer ordern och beställer fler där.</span>
              </dd>
              <dt>Följesedel</dt>
              <dd>
                <a href={packingSlipPath(order.packingCode)} target="_blank" rel="noreferrer" className={styles.link}>
                  Öppna ↗
                </a>{" "}
                <span className={styles.muted}>Utan priser, med {isOwner(tenant) ? "namnskylt.coms" : "din"} logga. Verkstaden skriver ut den och lägger den i paketet.</span>
              </dd>
              <dt>Betalning</dt>
              <dd>
                {paymentLabel(order.payment)}
                {order.payment && order.status === "cancelled" && (
                  <span className={styles.muted}> · återbetalas i Stripe, det görs inte härifrån</span>
                )}
              </dd>
              {order.shopSlug && (
                <>
                  <dt>Butik</dt>
                  <dd>
                    <a href={`/butik/${order.shopSlug}`} target="_blank" rel="noreferrer" className={styles.link}>
                      {order.shopSlug} ↗
                    </a>
                  </dd>
                </>
              )}
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
            <h2 className={styles.sectionTitle} style={{ marginBottom: "var(--space-3)" }}>
              Leverans
            </h2>
            <DeliveryPanel
              target={{ kind: "order", orderNo: order.orderNo }}
              delivery={order.delivery}
              options={addresses}
              locked={order.demo ? "Demoorder, skickas inte." : deliveryLocked}
            />
          </section>
          <section className={styles.panel}>
            <h2 className={styles.sectionTitle}>Tidslinje</h2>
            <p className={styles.syncNote} data-link={link}>
              {SYNC_NOTE[link]}
              {link === "connected" && order.supplierSyncedAt && <> · senast {formatDate(order.supplierSyncedAt)}</>}
            </p>
            {waitReasons.length > 0 && (
              <ul className={styles.syncReasons} role="list">
                {waitReasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
                {fixHint && (
                  <li>
                    Fyll i uppgifterna under{" "}
                    <Link href="/admin/installningar" className={styles.link}>
                      Inställningar
                    </Link>
                    , så skickas ordern.
                  </li>
                )}
              </ul>
            )}
            <OrderTimeline order={order} />
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
