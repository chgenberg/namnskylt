"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { BadgePreview } from "@/components/badge-preview";
import { CopyOrderLink } from "@/components/copy-order-link";
import { usePriceList } from "@/components/price-list-provider";
import { priceOrder } from "@/engine";
import { shippingMethodOf } from "@/lib/orders/delivery";
import { useOrderShipping } from "@/hooks/use-order-shipping";
import { formatSek } from "@/lib/format";
import { badgeCount, type StoredOrder } from "@/lib/orders/model";
import { repeatOrderAction } from "./actions";
import styles from "./admin.module.css";

interface RepeatButtonProps {
  order: StoredOrder;
  compact?: boolean;
}

/**
 * "Beställ igen": samma skyltar, samma antal — bekräftas med pris innan den
 * skickas. Den som vill byta namn, antal eller något annat öppnar ordern i
 * skyltmotorn med "Ändra först": skyltarna ligger då i varukorgen, klara att ändra.
 */
export function RepeatButton({ order, compact = false }: RepeatButtonProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [opened, setOpened] = useState(false);
  // En ny order får dagens priser och dagens frakt, inte den gamla orderns. Frakten hämtas först när dialogen öppnas.
  // Leveranssättet ärvs: upphämtning och express har ingen frakt på ordern.
  const standard = shippingMethodOf(order.delivery) === "standard";
  const standardShipping = useOrderShipping(order.badges, undefined, opened && standard);
  const shipping = standard ? standardShipping : 0;
  const price = priceOrder(order.badges, usePriceList(), shipping ?? 0);
  const first = order.badges[0];

  const confirm = () => {
    setError(null);
    startTransition(async () => {
      const result = await repeatOrderAction(order.orderNo);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      dialog.current?.close();
      if (result.orderNo) router.push(`/admin/ordrar/${result.orderNo}`);
    });
  };

  return (
    <>
      <button
        type="button"
        className={styles.repeat}
        disabled={order.badges.length === 0}
        onClick={() => {
          setOpened(true);
          dialog.current?.showModal();
        }}
      >
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M13.5 8A5.5 5.5 0 1 1 11.9 4.1M13.5 2.5v3h-3" />
        </svg>
        {compact ? "Igen" : "Beställ igen"}
      </button>
      <dialog
        ref={dialog}
        className={styles.dialog}
        aria-labelledby={`repeat-${order.orderNo}`}
        onClick={(event) => {
          if (event.target === event.currentTarget) dialog.current?.close();
        }}
      >
        <div className={styles.dialogBody}>
          <p className={styles.eyebrow}>Beställ igen</p>
          <h2 id={`repeat-${order.orderNo}`} className={styles.dialogTitle}>
            Samma order till {order.customer.company ?? order.customer.name}
          </h2>
          {first && (
            <div className={styles.dialogPreview}>
              <BadgePreview doc={first} />
            </div>
          )}
          <dl className={styles.summary}>
            <dt>Kopia av</dt>
            <dd className="mono">{order.orderNo}</dd>
            <dt>Namn</dt>
            <dd>{order.badges.length}</dd>
            <dt>Skyltar</dt>
            <dd>{badgeCount(order)} st</dd>
            {shipping !== null && shipping > 0 && (
              <>
                <dt>Varav frakt</dt>
                <dd>{formatSek(shipping)}</dd>
              </>
            )}
            <dt className={styles.summaryTotal}>Totalt exkl. moms</dt>
            <dd className={styles.summaryTotal}>{formatSek(price.totalSek)}</dd>
          </dl>
          <p className={styles.muted}>
            {shipping === null && "Frakt tillkommer. "}
            Ordern skickas direkt till tillverkningen med samma design och antal. Ska något vara annorlunda, till exempel
            andra namn eller ett annat antal? Välj Ändra först, så öppnas skyltarna i skyltmotorn.
          </p>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          <div className={styles.dialogActions}>
            <button type="button" className="btn btn--ghost" onClick={() => dialog.current?.close()}>
              Avbryt
            </button>
            <CopyOrderLink href={`/skapa?kund=${order.customer.id}&kopia=${encodeURIComponent(order.orderNo)}`} className="btn">
              Ändra först
            </CopyOrderLink>
            <button type="button" className="btn btn--primary" disabled={pending} onClick={confirm}>
              {pending ? "Lägger ordern…" : shipping === null ? "Beställ" : `Beställ · ${formatSek(price.totalInclVatSek)} inkl. moms`}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
