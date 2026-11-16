import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgePreview } from "@/components/badge-preview";
import { engravedRows, getColor, getMaterial, mountingLabel, shapeLabel } from "@/engine";
import { ReorderForm } from "@/features/quote-public/reorder-form";
import styles from "@/features/quote-public/quote-public.module.css";
import { companyFooter, readableOn } from "@/lib/company/profile";
import { formatDay, formatSek } from "@/lib/format";
import { darkPlate, isLightLogo } from "@/lib/images/logo-tone";
import { customerHead, customerTimeline } from "@/lib/orders/customer-view";
import { deliveryLines, SHIPPING_METHOD_LABEL, shippingMethodOf } from "@/lib/orders/delivery";
import { isErasedCustomer } from "@/lib/orders/erase-model";
import { priceWithPricing } from "@/lib/orders/pricing";
import { databaseConfigured, getCompanyProfile, getOrderByCustomerToken } from "@/lib/orders/repository";
import { paymentLabel } from "@/lib/payments/model";
import { reorderMode } from "@/lib/quotes/reorder-model";
import { encodeShareCode } from "@/lib/share/share-link";

export const metadata: Metadata = {
  title: "Din order",
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = "force-dynamic";

/**
 * Kundens egen ordersida. Koden i länken är behörigheten, som för en offert:
 * sidan är öppen förbi sajtspärren. Här följer kunden ordern och beställer
 * fler skyltar med samma design.
 */
export default async function CustomerOrderPage({ params }: { params: Promise<{ token: string }> }) {
  if (!databaseConfigured()) notFound();
  const order = await getOrderByCustomerToken((await params).token);
  // En borttagen kunds order står bara kvar för bokföringen, och länken ska inte visa något.
  if (!order || isErasedCustomer(order.customer)) notFound();
  const company = await getCompanyProfile(order.resellerId);
  const plate = (await isLightLogo(company.logo)) ? darkPlate(company.primaryColor) : null;
  const brand = {
    "--brand": company.primaryColor,
    "--brand-on": readableOn(company.primaryColor),
    "--brand-accent": company.accentColor,
  } as React.CSSProperties;
  const head = customerHead(order.status);
  const timeline = customerTimeline(order.status, order.events);
  const priced = priceWithPricing(order.badges, order.pricing, order.priceList, order.shippingSek);
  const method = shippingMethodOf(order.delivery);
  // Expressfraktens pris sätts av verkstaden i efterhand. Tills dess är summan utan frakt.
  const expressPending = method === "express" && order.expressShippingSek === null;
  const mode = reorderMode({ status: order.status, badges: order.badges, paid: order.payment !== null, erased: false });
  const template = order.badges[0];
  const designerBase = order.shopSlug ? `/butik/${order.shopSlug}/skapa` : "/skapa";
  const share = mode === "designer" && template ? await encodeShareCode(template).catch(() => null) : null;

  return (
    <main className={styles.page} style={brand}>
      <div className={styles.inner}>
        {company.logo ? (
          // eslint-disable-next-line @next/next/no-img-element -- data-URL ur inställningarna
          <img
            src={company.logo}
            alt={company.name}
            className={styles.logo}
            style={plate ? { background: plate, padding: "6px 12px", borderRadius: 10 } : undefined}
          />
        ) : company.name === "namnskylt.com" ? (
          <Image src="/logo-namnskylt.svg" alt="namnskylt.com" width={504} height={97} unoptimized className={styles.logo} priority />
        ) : (
          <p className={styles.brandName}>{company.name}</p>
        )}
        <header className={styles.head}>
          <p className={styles.eyebrow}>
            Order · <span className="mono">{order.orderNo}</span>
          </p>
          <h1 className={styles.title}>{head.title}</h1>
          <p className={styles.lead}>{head.text}</p>
        </header>

        <section className={styles.card}>
          {timeline.length > 0 && (
            <ol className={styles.timeline} aria-label="Orderns status">
              {timeline.map((step) => (
                <li key={step.status} data-done={step.done || undefined} data-current={step.current || undefined}>
                  <span className={styles.dot} aria-hidden="true" />
                  <span>{step.label}</span>
                  <span>{step.at ? formatDay(step.at) : ""}</span>
                </li>
              ))}
            </ol>
          )}
          {order.trackingUrl && (
            <div className={styles.track}>
              <a href={order.trackingUrl} target="_blank" rel="noreferrer" className="btn btn--primary">
                Följ försändelsen
              </a>
            </div>
          )}

          <ul className={styles.lines}>
            {order.badges.map((badge, i) => {
              const line = priced.lines[i];
              const text = engravedRows(badge)
                .map((row) => row.text.trim())
                .filter(Boolean)
                .join(", ");
              return (
                <li key={i} className={styles.line}>
                  <BadgePreview doc={badge} className={styles.lineBadge} label={`Skylt: ${text}`} />
                  <div>
                    <div className={styles.lineName}>{text || "Utan text"}</div>
                    <div className={styles.lineSpec}>
                      {getMaterial(badge.materialId).name} · {getColor(badge.materialId, badge.colorId).name} · {shapeLabel(badge)}{" "}
                      {badge.size.widthMm}×{badge.size.heightMm} mm · {mountingLabel(badge)}
                    </div>
                  </div>
                  <div className={styles.lineAmount}>
                    {line?.quantity} st × {formatSek(line?.unitSek ?? 0)}
                    <div>
                      <strong>{formatSek(line?.totalSek ?? 0)}</strong>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          <dl className={styles.totals}>
            <dt>Skyltar</dt>
            <dd>{formatSek(priced.goodsSek)}</dd>
            <dt>Frakt, {SHIPPING_METHOD_LABEL[method].toLowerCase()}</dt>
            <dd>{expressPending ? "tillkommer" : formatSek(priced.shippingSek)}</dd>
            <dt className={styles.grand}>Totalt exkl. moms</dt>
            <dd className={styles.grand}>{formatSek(priced.totalSek)}</dd>
            <dt>Moms 25 %</dt>
            <dd>{formatSek(priced.vatSek)}</dd>
            <dt>
              <strong>{expressPending ? "Summa, utan frakt" : "Summa"}</strong>
            </dt>
            <dd>
              <strong>{formatSek(priced.totalInclVatSek)}</strong>
            </dd>
            <dt>Betalning</dt>
            <dd>{paymentLabel(order.payment)}</dd>
          </dl>
          {order.delivery && (
            <p className={styles.deliveryNote}>
              <strong>{order.delivery.to === "reseller" ? `Skyltarna skickas till ${company.name}` : "Skyltarna skickas till"}</strong>
              {order.delivery.to === "customer" && deliveryLines(order.delivery.address).map((line) => <span key={line}>{line}</span>)}
            </p>
          )}

          {mode !== "none" && order.status !== "cancelled" && (
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Beställ fler med samma design</h2>
              <p className={styles.sectionLead}>
                Ny personal? Skyltarna får samma material, form, logga och fäste som i den här ordern. Bara namnen är nya.
              </p>
              {mode === "quote" ? (
                <ReorderForm token={order.customerToken} />
              ) : (
                <div className={styles.track}>
                  <Link href={share?.code ? `${designerBase}?d=${encodeURIComponent(share.code)}` : designerBase} className="btn btn--primary">
                    Öppna designen i skyltmotorn
                  </Link>
                </div>
              )}
            </div>
          )}
        </section>

        <div className={styles.foot}>
          {companyFooter(company).map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      </div>
    </main>
  );
}
