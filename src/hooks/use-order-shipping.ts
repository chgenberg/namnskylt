"use client";

import { useEffect, useRef, useState } from "react";
import { resellerOrder, type BadgeDocument, type PriceTable } from "@/engine";
import { SHIPPING_PATH, shippingItems } from "@/lib/orders/shipping";

/** Väntan efter senaste ändringen, så att varje tangenttryck i antalsfältet inte blir en fråga. */
const WAIT_MS = 150;

/**
 * Frakten för skyltarna, för en order som inte är lagd än. Den är samma i alla
 * led och räknas på det återförsäljaren betalar. En inloggad återförsäljare har
 * sin inköpslista (`purchaseList`) och räknar direkt; annars frågas servern,
 * som bara svarar med beloppet.
 *
 * `null` betyder att frakten inte är känd än, eller att servern inte svarade.
 * Medan en ny fråga är på väg står det förra beloppet kvar, så att summan inte
 * hoppar. `enabled: false` väntar med frågan, till exempel tills en dialog öppnas.
 */
export function useOrderShipping(badges: readonly BadgeDocument[], purchaseList?: PriceTable, enabled = true): number | null {
  const [answer, setAnswer] = useState<number | null>(null);
  const answered = useRef(false);
  const items = purchaseList ? [] : shippingItems(badges);
  const body = JSON.stringify({ items });
  const ask = enabled && items.length > 0;

  useEffect(() => {
    if (!ask) return;
    const controller = new AbortController();
    const timer = window.setTimeout(
      () => {
        fetch(SHIPPING_PATH, { method: "POST", headers: { "content-type": "application/json" }, body, signal: controller.signal })
          .then((response) => (response.ok ? (response.json() as Promise<{ shippingSek?: unknown }>) : null))
          .then((data) => {
            answered.current = true;
            setAnswer(typeof data?.shippingSek === "number" ? data.shippingSek : null);
          })
          .catch(() => {
            // En avbruten fråga har ersatts av en ny. Ett annat fel lämnar frakten okänd.
            if (!controller.signal.aborted) setAnswer(null);
          });
      },
      answered.current ? WAIT_MS : 0,
    );
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [ask, body]);

  if (purchaseList) return resellerOrder(badges, purchaseList).shippingSek;
  if (badges.length === 0) return 0;
  return answer;
}
