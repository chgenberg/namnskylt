"use client";

import { useEffect, useRef, useState } from "react";
import { extraDeliverySekOf, resellerOrder, type BadgeDocument, type PriceTable } from "@/engine";
import { SHIPPING_PATH, shippingItems } from "@/lib/orders/shipping";

/** Väntan efter senaste ändringen, så att varje tangenttryck i antalsfältet inte blir en fråga. */
const WAIT_MS = 150;
const UNKNOWN: OrderShippingChoices = { standardSek: null, parcelSek: null, extraDeliverySek: null };

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
  return useOrderShippingChoices(badges, purchaseList, enabled).standardSek;
}

interface OrderShippingChoices {
  /** Standardfrakten: varubrev eller paket efter fraktregeln. `null` när den inte är känd. */
  standardSek: number | null;
  /** Paketets pris när det går att välja i stället för varubrevet, annars `null`. */
  parcelSek: number | null;
  /** Frakten för varje extra leveransadress, när ordern ska till flera ställen. `null` när den inte är känd. */
  extraDeliverySek: number | null;
}

/**
 * Som `useOrderShipping`, med paketets pris när den som beställer kan välja paket i stället för
 * varubrevet (beslut av ägaren 2026-11-20).
 */
export function useOrderShippingChoices(badges: readonly BadgeDocument[], purchaseList?: PriceTable, enabled = true): OrderShippingChoices {
  const [answer, setAnswer] = useState<OrderShippingChoices>(UNKNOWN);
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
          .then((response) =>
            response.ok ? (response.json() as Promise<{ shippingSek?: unknown; parcelSek?: unknown; extraDeliverySek?: unknown }>) : null,
          )
          .then((data) => {
            answered.current = true;
            setAnswer(
              typeof data?.shippingSek === "number"
                ? {
                    standardSek: data.shippingSek,
                    parcelSek: typeof data.parcelSek === "number" ? data.parcelSek : null,
                    extraDeliverySek: typeof data.extraDeliverySek === "number" ? data.extraDeliverySek : null,
                  }
                : UNKNOWN,
            );
          })
          .catch(() => {
            // En avbruten fråga har ersatts av en ny. Ett annat fel lämnar frakten okänd.
            if (!controller.signal.aborted) setAnswer(UNKNOWN);
          });
      },
      answered.current ? WAIT_MS : 0,
    );
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [ask, body]);

  if (purchaseList) {
    const order = resellerOrder(badges, purchaseList);
    return { standardSek: order.shippingSek, parcelSek: order.parcelChoiceSek, extraDeliverySek: extraDeliverySekOf(purchaseList.shipping) };
  }
  if (badges.length === 0) return { standardSek: 0, parcelSek: null, extraDeliverySek: null };
  return answer;
}
