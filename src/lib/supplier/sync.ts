import "server-only";
import { isOpen, type StoredOrder } from "@/lib/orders/model";
import { applySupplierUpdate } from "@/lib/orders/repository";
import { announceShipped } from "@/lib/orders/shipped";
import { createSupplierClient, supplierApiConfigured } from "./client";
import { advancesTo, isTrackableSupplierOrder, toOrderStatus } from "./status";
import type { SupplierOrderState } from "./types";

/** Webhooken håller statusen färsk; hämtningen är reserven om en webhook tappats. */
const RESYNC_AFTER_MS = 2 * 60_000;

export type SupplierLink = "connected" | "not-configured" | "not-sent" | "demo";

export function supplierLink(order: StoredOrder): SupplierLink {
  if (order.demo) return "demo";
  if (!supplierApiConfigured()) return "not-configured";
  return isTrackableSupplierOrder(order.supplierOrderNo) ? "connected" : "not-sent";
}

/** Leverantörens nummer när ordern ligger hos tryckeriet och ännu inte är klar. */
export function atPrinter(order: StoredOrder): string | null {
  return supplierLink(order) === "connected" && isOpen(order) ? order.supplierOrderNo : null;
}

export async function applySupplierState(state: SupplierOrderState): Promise<{ found: boolean; changed: boolean }> {
  const result = await applySupplierUpdate(
    state.orderNumber,
    { status: toOrderStatus(state.status), trackingUrl: state.trackingUrl, expressShippingSek: state.shippingCost, at: state.changedAt },
    advancesTo,
  );
  // Kunden och återförsäljaren får veta att skyltarna är på väg. Ingen av dem väntar på det här.
  if (result.status === "shipped" && result.orderNo) void announceShipped(result.orderNo);
  return { found: result.found, changed: result.changed };
}

/** Hämtar statusen när den kan ha ändrats. Fel loggas — sidan visas med det vi redan vet. */
export async function refreshFromSupplier(order: StoredOrder): Promise<boolean> {
  if (supplierLink(order) !== "connected" || !isOpen(order) || !order.supplierOrderNo) return false;
  const synced = order.supplierSyncedAt ? Date.parse(order.supplierSyncedAt) : 0;
  if (Date.now() - synced < RESYNC_AFTER_MS) return false;
  try {
    const state = await createSupplierClient().getOrder(order.supplierOrderNo);
    if (!state) return false;
    return (await applySupplierState({ ...state, orderNumber: order.supplierOrderNo })).changed;
  } catch (error) {
    console.error(`Status för ${order.orderNo} kunde inte hämtas från leverantören`, error);
    return false;
  }
}
