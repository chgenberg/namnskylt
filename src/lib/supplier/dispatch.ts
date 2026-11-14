import "server-only";
import { renderLogoPng } from "@/lib/ai/badge-image";
import { loadNodeFontEngine } from "@/lib/fonts/load-node";
import { withInlineLogoImages } from "@/lib/logo-images/repository";
import type { StoredOrder } from "@/lib/orders/model";
import {
  claimForDispatch,
  getCompanyProfile,
  getOrderForDispatch,
  markDispatched,
  markDispatchFailed,
} from "@/lib/orders/repository";
import { accountEmail } from "@/lib/reseller-auth/accounts";
import { createSupplierClient, supplierApiConfigured } from "./client";
import { buildSupplierRequest, dispatchProblems, MAX_REQUEST_BYTES, requestBytes, supplierBuyer } from "./request";
import { isTrackableSupplierOrder } from "./status";
import type { SupplierBuyer, SupplierOrderRequest } from "./types";

/**
 * Var ordern står på vägen till verkstaden.
 * `waiting` = klar att skickas, `blocked` = något saknas, `failed` = senaste
 * försöket misslyckades, `sent` = verkstaden har den.
 */
export type DispatchState = "demo" | "cancelled" | "sent" | "blocked" | "failed" | "waiting";

export interface DispatchStatus {
  state: DispatchState;
  /** Det som saknas när ordern är `blocked`. */
  problems: string[];
}

/** Beställaren hos verkstaden: återförsäljaren ordern tillhör. */
export async function buyerFor(tenant: string): Promise<SupplierBuyer> {
  return supplierBuyer(tenant, await getCompanyProfile(tenant), await accountEmail(tenant));
}

export function dispatchStatus(order: StoredOrder, buyer: SupplierBuyer | null): DispatchStatus {
  if (order.demo) return { state: "demo", problems: [] };
  if (order.supplierSentAt || isTrackableSupplierOrder(order.supplierOrderNo)) return { state: "sent", problems: [] };
  if (order.status === "cancelled") return { state: "cancelled", problems: [] };
  const problems = dispatchProblems(order, buyer);
  if (problems.length > 0) return { state: "blocked", problems };
  return { state: order.supplierError ? "failed" : "waiting", problems: [] };
}

/** Anropet till verkstaden för en order, som det skulle skickas nu. `null` när något saknas. */
export async function supplierRequestFor(order: StoredOrder, buyer: SupplierBuyer): Promise<SupplierOrderRequest | null> {
  if (!order.delivery || !order.purchaseList || dispatchProblems(order, buyer).length > 0) return null;
  return buildSupplierRequest({
    orderNo: order.orderNo,
    project: order.project,
    customer: order.customer,
    buyer,
    delivery: order.delivery,
    // Verkstaden får bilden själv, inte adressen till den hos oss.
    badges: await withInlineLogoImages(order.badges),
    purchaseList: order.purchaseList,
    fonts: await loadNodeFontEngine(),
    logoPng: renderLogoPng,
  });
}

export type DispatchOutcome =
  | { ok: true; supplierOrderNo: string; estimatedShipDate?: string }
  | { ok: false; reason: "not-configured" | "blocked" | "busy" | "failed"; error: string };

/**
 * Skickar en sparad order till Skylt & Gravyrteknik. Gör ingenting utan
 * `SUPPLIER_API_URL` och `SUPPLIER_API_KEY`: då ligger ordern kvar och väntar.
 * Ett fel sparas på ordern, som kan skickas igen från adminens översikt.
 */
export async function dispatchOrder(orderNo: string): Promise<DispatchOutcome> {
  if (!supplierApiConfigured()) return { ok: false, reason: "not-configured", error: "Kopplingen till verkstaden är inte aktiverad" };
  const order = await getOrderForDispatch(orderNo);
  if (!order) return { ok: false, reason: "failed", error: "Ordern finns inte" };
  if (order.supplierSentAt && order.supplierOrderNo) return { ok: true, supplierOrderNo: order.supplierOrderNo };
  const buyer = await buyerFor(order.resellerId);
  const status = dispatchStatus(order, buyer);
  if (status.state === "demo") return { ok: false, reason: "blocked", error: "Demoordrar skickas inte till verkstaden" };
  if (status.state === "cancelled") return { ok: false, reason: "blocked", error: "Ordern är avbruten" };
  if (status.state === "blocked") return { ok: false, reason: "blocked", error: status.problems.join(". ") };
  if (!(await claimForDispatch(order.id))) return { ok: false, reason: "busy", error: "Ordern skickas redan" };
  try {
    const request = await supplierRequestFor(order, buyer);
    if (!request) throw new Error("Ordern går inte att skicka");
    const bytes = requestBytes(request);
    if (bytes > MAX_REQUEST_BYTES) {
      throw new Error(`Ordern är för stor för ett anrop (${(bytes / 1_000_000).toFixed(1)} MB). Dela upp den i flera ordrar.`);
    }
    const receipt = await createSupplierClient().placeOrder(request);
    await markDispatched(order.id, receipt.orderNumber);
    return { ok: true, supplierOrderNo: receipt.orderNumber, estimatedShipDate: receipt.estimatedShipDate };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Okänt fel";
    console.error(`Order ${orderNo} kunde inte skickas till verkstaden`, error);
    await markDispatchFailed(order.id, message);
    return { ok: false, reason: "failed", error: message };
  }
}
