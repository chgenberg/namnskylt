"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { DeliveryFields } from "@/components/delivery-fields";
import { ShippingMethodPicker } from "@/components/shipping-method-picker";
import { Segmented } from "@/components/ui/segmented";
import { SHIPPING_METHODS, type ShippingMethod } from "@/engine";
import {
  addressFromDraft,
  DELIVERY_TO_LABEL,
  deliveryLines,
  draftFromAddress,
  SHIPPING_METHOD_INFO,
  SHIPPING_METHOD_LABEL,
  shippingMethodOf,
  type DeliveryAddress,
  type DeliveryDraft,
  type DeliveryOptions,
  type DeliveryTo,
} from "@/lib/orders/delivery";
import { updateOrderDeliveryAction } from "./actions";
import { updateQuoteDeliveryAction } from "./quote-actions";
import styles from "./admin.module.css";

const TO_OPTIONS = (["customer", "reseller"] as const).map((id) => ({ id, label: DELIVERY_TO_LABEL[id] }));

interface DeliveryPanelProps {
  /** Ordern eller offerten leveransen hör till. */
  target: { kind: "order"; orderNo: string } | { kind: "quote"; quoteNo: string };
  /** Nuvarande leverans. `null` på en order från före leveransadressen. */
  delivery: { to: DeliveryTo; address: DeliveryAddress | null; method?: ShippingMethod } | null;
  /** Förifyllda adresser för de två valen. */
  options: DeliveryOptions;
  /** Varför leveransen inte går att ändra längre; `null` när den går att ändra. */
  locked: string | null;
}

const isEmpty = (draft: DeliveryDraft) => Object.values(draft).every((value) => !value.trim());

/**
 * Vart och hur skyltarna skickas: till kunden eller till återförsäljaren, med
 * adress och leveranssätt. På en offert till kunden får adressen lämnas tom,
 * eftersom kunden fyller i den när offerten godkänns. Frakten följer
 * leveranssättet, så summan räknas om när det ändras.
 */
export function DeliveryPanel({ target, delivery, options, locked }: DeliveryPanelProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [to, setTo] = useState<DeliveryTo>(delivery?.to ?? "customer");
  const [method, setMethod] = useState<ShippingMethod>(shippingMethodOf(delivery));
  const [drafts, setDrafts] = useState<DeliveryOptions>(() =>
    delivery?.address ? { ...options, [delivery.to]: draftFromAddress(delivery.address) } : options,
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const quote = target.kind === "quote";

  const save = () => {
    setError(null);
    const draft = drafts[to];
    // På en offert till kunden får adressen vänta tills kunden godkänner.
    const leaveEmpty = quote && to === "customer" && isEmpty(draft);
    const parsed = leaveEmpty ? null : addressFromDraft(draft);
    if (parsed && !parsed.ok) {
      setError(parsed.error);
      return;
    }
    startTransition(async () => {
      const result =
        target.kind === "quote"
          ? await updateQuoteDeliveryAction(target.quoteNo, { to, address: parsed?.address ?? null, method })
          : parsed
            ? await updateOrderDeliveryAction(target.orderNo, { to, address: parsed.address, method })
            : { ok: false as const, error: "Fyll i leveransadressen" };
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  };

  if (editing) {
    return (
      <div className={styles.form}>
        <Segmented label="Skyltarna skickas" value={to} options={TO_OPTIONS} onChange={setTo} />
        <DeliveryFields
          value={drafts[to]}
          onChange={(draft) => setDrafts((all) => ({ ...all, [to]: draft }))}
          disabled={pending}
          required={!(quote && to === "customer")}
        />
        {quote && to === "customer" && (
          <p className={styles.muted}>Lämna adressen tom om du inte har den. Kunden fyller då i den när offerten godkänns.</p>
        )}
        <ShippingMethodPicker value={method} onChange={setMethod} methods={SHIPPING_METHODS} disabled={pending} />
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <div className={styles.actionBar}>
          <button type="button" className="btn btn--primary" disabled={pending} onClick={save}>
            {pending ? "Sparar…" : "Spara leveransen"}
          </button>
          <button type="button" className="btn btn--ghost" disabled={pending} onClick={() => setEditing(false)}>
            Avbryt
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.form}>
      {delivery?.address ? (
        <p>
          <strong>{DELIVERY_TO_LABEL[delivery.to]}</strong>
          {deliveryLines(delivery.address).map((line) => (
            <span key={line} style={{ display: "block" }}>
              {line}
            </span>
          ))}
        </p>
      ) : quote ? (
        <p>
          <strong>{DELIVERY_TO_LABEL[delivery?.to ?? "customer"]}</strong>
          <span style={{ display: "block" }} className={styles.muted}>
            Ingen adress ifylld. Kunden fyller i den när offerten godkänns.
          </span>
        </p>
      ) : (
        <p className={styles.error} role="status">
          Leveransadress saknas. Ordern kan inte gå till verkstaden förrän den är ifylld.
        </p>
      )}
      {shippingMethodOf(delivery) !== "standard" && (
        <p>
          <strong>{SHIPPING_METHOD_LABEL[shippingMethodOf(delivery)]}</strong>
          <span style={{ display: "block" }} className={styles.muted}>
            {SHIPPING_METHOD_INFO[shippingMethodOf(delivery)]}
          </span>
        </p>
      )}
      {locked ? (
        <p className={styles.muted}>{locked}</p>
      ) : (
        <div className={styles.actionBar}>
          <button type="button" className={styles.ghostButton} onClick={() => setEditing(true)}>
            {delivery?.address ? "Ändra leveransen" : "Fyll i leveransadress"}
          </button>
        </div>
      )}
    </div>
  );
}
