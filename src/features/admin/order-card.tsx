import Link from "next/link";
import { BadgePreview } from "@/components/badge-preview";
import { formatRelative, formatSek } from "@/features/orders/format";
import { badgeCount, ORDER_SOURCE_LABEL, type StoredOrder } from "@/lib/orders/model";
import { atPrinter } from "@/lib/supplier/sync";
import { DeleteOrderButton } from "./delete-order-button";
import { RepeatButton } from "./repeat-button";
import { StatusPill } from "./status-pill";
import styles from "./admin.module.css";

const STACKED = 3;

export function OrderCard({ order }: { order: StoredOrder }) {
  const count = badgeCount(order);
  const names = order.badges.length;
  return (
    <article className={styles.orderCard}>
      <Link href={`/admin/ordrar/${order.orderNo}`} className={styles.orderCardLink} aria-label={`Öppna ${order.orderNo}`} />
      <div className={styles.stage} aria-hidden="true">
        {order.hasBadgeShot ? (
          // eslint-disable-next-line @next/next/no-img-element -- privat bild bakom inloggningen
          <img src={`/api/admin/orders/${order.orderNo}/shot`} alt="" className={styles.stageShot} loading="lazy" />
        ) : (
          <div className={styles.stageStack}>
            {order.badges.slice(0, STACKED).map((badge, i) => (
              <BadgePreview key={i} doc={badge} className={styles.stageBadge} />
            ))}
          </div>
        )}
        {names > 1 && <span className={styles.stageCount}>{names} namn</span>}
      </div>
      <div className={styles.cardBody}>
        <div className={styles.cardTop}>
          <span className={styles.orderNo}>{order.orderNo}</span>
          <StatusPill status={order.status} />
        </div>
        <h3 className={styles.cardTitle}>{order.customer.company ?? order.customer.name}</h3>
        <div className={styles.cardMeta}>
          <span>{count} st</span>
          <span>{formatRelative(order.placedAt)}</span>
          {order.source !== "web" && <span className={styles.source}>{ORDER_SOURCE_LABEL[order.source]}</span>}
          {order.demo && <span className={styles.demoTag}>Demo</span>}
        </div>
        <div className={styles.cardFoot}>
          <span className={styles.amount}>{formatSek(order.totalSek)}</span>
          <div className={styles.cardActions}>
            <DeleteOrderButton
              orderNo={order.orderNo}
              customerName={order.customer.company ?? order.customer.name}
              badgeCount={count}
              totalSek={order.totalSek}
              atPrinter={atPrinter(order)}
              compact
            />
            <RepeatButton order={order} compact />
          </div>
        </div>
      </div>
    </article>
  );
}
