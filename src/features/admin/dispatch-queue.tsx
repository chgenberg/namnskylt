import "server-only";
import { formatDate, formatDay } from "@/lib/format";
import { logoOriginalHref, referencedLogoOriginals } from "@/lib/logo-images/original-model";
import { SHIPPING_METHOD_LABEL, shippingMethodOf } from "@/lib/orders/delivery";
import { badgeCount } from "@/lib/orders/model";
import type { DispatchOrder } from "@/lib/orders/repository";
import type { DispatchState, DispatchStatus } from "@/lib/supplier/dispatch";
import { DispatchButton } from "./dispatch-button";
import { ExpressPriceField } from "./express-price-field";
import admin from "./admin.module.css";
import styles from "./reseller-orders.module.css";

export interface DispatchRow extends DispatchOrder {
  status: DispatchStatus;
}

const STATE_LABEL: Record<DispatchState, string> = {
  waiting: "Väntar",
  blocked: "Saknar uppgifter",
  failed: "Misslyckades",
  sent: "Hos verkstaden",
  cancelled: "Avbruten",
  demo: "Demo",
};

const count = (rows: readonly DispatchRow[], state: DispatchState) => rows.filter((row) => row.status.state === state).length;

/**
 * Adminens översikt över ordrarnas väg till Skylt & Gravyrteknik: vad som
 * väntar, vad som saknar uppgifter, vad som misslyckats och vad verkstaden har.
 * Serverkomponent — inköpspriser och andra återförsäljares ordrar når aldrig en återförsäljare.
 */
export function DispatchQueue({ rows, connected }: { rows: DispatchRow[]; connected: boolean }) {
  return (
    <>
      <div className={admin.kpis}>
        <div className={admin.kpi} data-tone={count(rows, "waiting") > 0 ? "gold" : undefined}>
          <span className={admin.kpiLabel}>Väntar</span>
          <span className={admin.kpiValue}>{count(rows, "waiting")}</span>
          <span className={admin.kpiHint}>klara att skicka</span>
        </div>
        <div className={admin.kpi}>
          <span className={admin.kpiLabel}>Saknar uppgifter</span>
          <span className={admin.kpiValue}>{count(rows, "blocked")}</span>
          <span className={admin.kpiHint}>adress eller organisationsnummer</span>
        </div>
        <div className={admin.kpi}>
          <span className={admin.kpiLabel}>Misslyckades</span>
          <span className={admin.kpiValue}>{count(rows, "failed")}</span>
          <span className={admin.kpiHint}>går att skicka igen</span>
        </div>
        <div className={admin.kpi}>
          <span className={admin.kpiLabel}>Hos verkstaden</span>
          <span className={admin.kpiValue}>{count(rows, "sent")}</span>
        </div>
      </div>

      <section className={`${admin.panel} ${admin.section}`} aria-labelledby="dispatch-orders">
        <div className={admin.sectionHead}>
          <h2 id="dispatch-orders" className={admin.sectionTitle}>
            Ordrar
          </h2>
          <span className={admin.muted}>Nyast först, alla återförsäljare. Demoordrar är inte med.</span>
        </div>
        <div className={styles.scroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Order</th>
                <th scope="col">Återförsäljare</th>
                <th scope="col" className={styles.num}>
                  Skyltar
                </th>
                <th scope="col">Leverans</th>
                <th scope="col">Läge</th>
                <th scope="col">Verkstadens nr</th>
                <th scope="col">
                  <span className="visually-hidden">Åtgärd</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ order, resellerName, status }) => (
                <tr key={order.orderNo}>
                  <th scope="row">
                    {order.orderNo}
                    <span className={styles.sub}>{formatDay(order.placedAt)}</span>
                  </th>
                  <td className={styles.wrap}>
                    {resellerName}
                    <span className={styles.sub}>{order.customer.company ?? order.customer.name}</span>
                  </td>
                  <td className={styles.num}>{badgeCount(order)}</td>
                  <td className={styles.wrap}>
                    {order.delivery ? (
                      <>
                        {order.delivery.address.zip} {order.delivery.address.city}
                        <span className={styles.sub}>
                          {order.delivery.to === "customer" ? "Till kunden" : "Till återförsäljaren"}
                          {shippingMethodOf(order.delivery) !== "standard" && ` · ${SHIPPING_METHOD_LABEL[shippingMethodOf(order.delivery)]}`}
                        </span>
                        {/* Expressfraktens pris sätter verkstaden. Tills deras system skickar det skrivs det in här. */}
                        {shippingMethodOf(order.delivery) === "express" && status.state !== "cancelled" && (
                          <ExpressPriceField orderNo={order.orderNo} sek={order.expressShippingSek} />
                        )}
                      </>
                    ) : (
                      <span className={admin.muted}>Saknas</span>
                    )}
                  </td>
                  <td className={styles.wrap}>
                    {STATE_LABEL[status.state]}
                    {status.problems.length > 0 && <span className={styles.sub}>{status.problems.join(". ")}</span>}
                    {status.state === "failed" && order.supplierError && (
                      <span className={styles.sub}>
                        {order.supplierError} · {order.supplierAttempts} försök
                      </span>
                    )}
                    {status.state === "sent" && order.supplierSentAt && <span className={styles.sub}>{formatDate(order.supplierSentAt)}</span>}
                  </td>
                  <td className="mono">{order.supplierSentAt ? order.supplierOrderNo : ""}</td>
                  <td>
                    {status.state !== "blocked" && status.state !== "cancelled" && (
                      <a href={`/api/admin/supplier/request/${order.orderNo}`} target="_blank" rel="noreferrer" className={admin.link}>
                        Underlag
                      </a>
                    )}{" "}
                    {/* Filen loggan lästes från. En sparad order pekar bara på filer som finns. */}
                    {referencedLogoOriginals(order.badges).map((id) => (
                      <span key={id}>
                        <a href={logoOriginalHref(id)} download className={admin.link}>
                          Loggans original
                        </a>{" "}
                      </span>
                    ))}
                    {connected && (status.state === "waiting" || status.state === "failed") && (
                      <DispatchButton orderNo={order.orderNo} retry={status.state === "failed"} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
