import "server-only";
import { formatDay, formatPercent, formatSek } from "@/lib/format";
import { sumShares, totalsByReseller, type ResellerOrderRow } from "@/lib/orders/provision";
import { StatusPill } from "./status-pill";
import admin from "./admin.module.css";
import styles from "./reseller-orders.module.css";

/**
 * Adminens samlade vy över ordrarna verkstaden fakturerar: vad som faktureras
 * (återförsäljaren, eller kunden på en direktorder), plattformens provision och
 * verkstadens del, per order och per säljare. Serverkomponent — inget av det
 * här når en återförsäljare.
 */
export function ResellerOrders({ rows }: { rows: ResellerOrderRow[] }) {
  const total = sumShares(rows);
  const resellers = totalsByReseller(rows);
  return (
    <>
      <div className={admin.kpis}>
        <div className={admin.kpi}>
          <span className={admin.kpiLabel}>Ordrar</span>
          <span className={admin.kpiValue}>{total.orders}</span>
          <span className={admin.kpiHint}>{total.quantity} skyltar</span>
        </div>
        <div className={admin.kpi}>
          <span className={admin.kpiLabel}>Verkstaden fakturerar</span>
          <span className={admin.kpiValue}>{formatSek(total.resellerSek)}</span>
          <span className={admin.kpiHint}>
            varor · frakt {formatSek(total.shippingSek)} tillkommer · kunderna betalar {formatSek(total.customerSek)}
          </span>
        </div>
        <div className={admin.kpi} data-tone="gold">
          <span className={admin.kpiLabel}>Er provision</span>
          <span className={admin.kpiValue}>{formatSek(total.provisionSek)}</span>
        </div>
        <div className={admin.kpi}>
          <span className={admin.kpiLabel}>Till Skylt &amp; Gravyrteknik</span>
          <span className={admin.kpiValue}>{formatSek(total.supplierSek)}</span>
          <span className={admin.kpiHint}>varor · hela frakten går också dit</span>
        </div>
      </div>

      <section className={`${admin.panel} ${admin.section}`} aria-labelledby="per-reseller">
        <div className={admin.sectionHead}>
          <h2 id="per-reseller" className={admin.sectionTitle}>
            Per säljare
          </h2>
        </div>
        <div className={styles.scroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Säljare</th>
                <th scope="col" className={styles.num}>
                  Ordrar
                </th>
                <th scope="col" className={styles.num}>
                  Skyltar
                </th>
                <th scope="col" className={styles.num}>
                  Faktureras, varor
                </th>
                <th scope="col" className={styles.num}>
                  Frakt
                </th>
                <th scope="col" className={styles.num}>
                  Er provision
                </th>
                <th scope="col" className={styles.num}>
                  Till verkstaden
                </th>
              </tr>
            </thead>
            <tbody>
              {resellers.map((reseller) => (
                <tr key={reseller.resellerId}>
                  <th scope="row" className={styles.wrap}>
                    {reseller.resellerName}
                  </th>
                  <td className={styles.num}>{reseller.orders}</td>
                  <td className={styles.num}>{reseller.quantity}</td>
                  <td className={styles.num}>{formatSek(reseller.resellerSek)}</td>
                  <td className={styles.num}>{formatSek(reseller.shippingSek)}</td>
                  <td className={`${styles.num} ${styles.own}`}>{formatSek(reseller.provisionSek)}</td>
                  <td className={styles.num}>{formatSek(reseller.supplierSek)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={`${admin.panel} ${admin.section}`} aria-labelledby="per-order">
        <div className={admin.sectionHead}>
          <h2 id="per-order" className={admin.sectionTitle}>
            Per order
          </h2>
          <span className={admin.muted}>
            Nyast först. Alla belopp exkl. moms. Provisionen räknas på varorna, inte på frakten: trappstegens procent på en
            återförsäljares order, prismodellens marginal på en direktorder.
          </span>
        </div>
        <div className={styles.scroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Order</th>
                <th scope="col">Säljare</th>
                <th scope="col">Status</th>
                <th scope="col" className={styles.num}>
                  Skyltar
                </th>
                <th scope="col" className={styles.num}>
                  Kund betalar
                </th>
                <th scope="col" className={styles.num}>
                  Verkstaden fakturerar, varor
                </th>
                <th scope="col" className={styles.num}>
                  Frakt
                </th>
                <th scope="col" className={styles.num}>
                  Er provision
                </th>
                <th scope="col" className={styles.num}>
                  Till verkstaden
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.orderNo}>
                  <th scope="row">
                    {row.orderNo}
                    <span className={styles.sub}>{formatDay(row.placedAt)}</span>
                  </th>
                  <td className={styles.wrap}>
                    {row.resellerName}
                    <span className={styles.sub}>{row.customer}</span>
                  </td>
                  <td>
                    <StatusPill status={row.status} />
                  </td>
                  <td className={styles.num}>{row.share.quantity}</td>
                  <td className={styles.num}>{formatSek(row.customerSek)}</td>
                  <td className={styles.num}>{formatSek(row.share.resellerSek)}</td>
                  <td className={styles.num}>{formatSek(row.share.shippingSek)}</td>
                  <td className={`${styles.num} ${styles.own}`}>
                    {formatSek(row.share.provisionSek)}
                    <span className={styles.sub}>{formatPercent(row.share.provisionPercent)}</span>
                  </td>
                  <td className={styles.num}>{formatSek(row.share.supplierSek)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3}>Summa</td>
                <td className={styles.num}>{total.quantity}</td>
                <td className={styles.num}>{formatSek(total.customerSek)}</td>
                <td className={styles.num}>{formatSek(total.resellerSek)}</td>
                <td className={styles.num}>{formatSek(total.shippingSek)}</td>
                <td className={styles.num}>{formatSek(total.provisionSek)}</td>
                <td className={styles.num}>{formatSek(total.supplierSek)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </>
  );
}
