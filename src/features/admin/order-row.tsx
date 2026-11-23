import Link from "next/link";
import { BadgePreview } from "@/components/badge-preview";
import { formatRelative, formatSek } from "@/lib/format";
import { isErasedCustomer } from "@/lib/orders/erase-model";
import { badgeCount, ORDER_SOURCE_LABEL, type StoredOrder } from "@/lib/orders/model";
import { atPrinter, listStatusOf } from "@/lib/supplier/sync";
import { DeleteOrderButton } from "./delete-order-button";
import { RepeatButton } from "./repeat-button";
import { ListStatusPill } from "./status-pill";
import styles from "./admin.module.css";

interface OrderRowProps {
  order: StoredOrder;
  /** Papperskorgen visas. Bara admin tar bort ordrar: en återförsäljare kan inte det (besked via ägaren 2026-11-20). */
  canDelete?: boolean;
}

/**
 * En order som en rad i listan (besked via ägaren 2026-11-20: "radannonser" i stället för kort,
 * för bättre ordning, med skylten längst till vänster i mindre format). Raderna står i
 * `styles.listRows`, som håller kolumnerna raka mellan raderna.
 */
export function OrderRow({ order, canDelete = false }: OrderRowProps) {
  const count = badgeCount(order);
  const names = order.badges.length;
  const first = order.badges[0];
  const customer = order.customer.company ?? order.customer.name;
  const status = listStatusOf(order);
  return (
    // Läget tonar raden i återförsäljarens panel, som i Godis-sajtens tabeller (`data-tone`).
    <article className={styles.listRow} data-tone={status}>
      <Link href={`/admin/ordrar/${order.orderNo}`} className={styles.listRowLink} aria-label={`Öppna ${order.orderNo}`} />
      <div className={styles.rowThumb} aria-hidden="true">
        {order.hasBadgeShot ? (
          // eslint-disable-next-line @next/next/no-img-element -- privat bild bakom inloggningen
          <img src={`/api/admin/orders/${order.orderNo}/shot`} alt="" loading="lazy" />
        ) : (
          first && <BadgePreview doc={first} />
        )}
      </div>
      <div className={styles.rowMain}>
        <h3 className={styles.rowName}>
          <span className={styles.orderNo}>{order.orderNo}</span>
          {order.project ?? customer}
        </h3>
        <div className={styles.cardMeta}>
          {order.project && <span>{customer}</span>}
          <span>{count} st</span>
          {names > 1 && <span>{names} namn</span>}
          <span>{formatRelative(order.placedAt)}</span>
          {order.source !== "web" && <span className={styles.source}>{ORDER_SOURCE_LABEL[order.source]}</span>}
          {order.demo && <span className={styles.demoTag}>Demo</span>}
        </div>
      </div>
      <div className={styles.rowTail}>
        <span className={styles.rowStatus}>
          <ListStatusPill status={status} />
        </span>
        <span className={styles.amount}>{formatSek(order.totalSek)}</span>
        <div className={styles.rowActions}>
          {canDelete && (
            <DeleteOrderButton
              orderNo={order.orderNo}
              customerName={customer}
              badgeCount={count}
              totalSek={order.totalSek}
              atPrinter={atPrinter(order)}
              compact
            />
          )}
          {!isErasedCustomer(order.customer) && <RepeatButton order={order} compact />}
        </div>
      </div>
    </article>
  );
}
