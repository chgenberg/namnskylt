"use client";

import { useEffect } from "react";
import { SHOP_EVENT_PATH, type ShopEventKind } from "@/lib/shops/events";

/** Räknar ett besök per flik och butik — en omladdning är inget nytt besök. */
export function ShopBeacon({ slug, kind }: { slug: string; kind: ShopEventKind }) {
  useEffect(() => {
    const key = `namnskylt:${kind}:${slug}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      // Blockerad lagring (t.ex. i en ram) — räkna ändå.
    }
    const body = JSON.stringify({ slug, kind });
    if (!navigator.sendBeacon?.(SHOP_EVENT_PATH, new Blob([body], { type: "application/json" }))) {
      void fetch(SHOP_EVENT_PATH, { method: "POST", body, headers: { "content-type": "application/json" }, keepalive: true }).catch(() => undefined);
    }
  }, [slug, kind]);
  return null;
}
