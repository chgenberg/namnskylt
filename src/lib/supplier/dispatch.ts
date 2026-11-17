import "server-only";
import { renderLogoPng } from "@/lib/ai/badge-image";
import { loadNodeFontEngine } from "@/lib/fonts/load-node";
import { requireDb } from "@/lib/db/client";
import { withInlineLogoImages } from "@/lib/logo-images/repository";
import { isDirectOrder, type StoredOrder } from "@/lib/orders/model";
import {
  claimForDispatch,
  getCompanyProfile,
  getOrderForDispatch,
  markDispatched,
} from "@/lib/orders/repository";
import { accountEmail } from "@/lib/reseller-auth/accounts";
import { createSupplierClient, supplierApiConfigured } from "./client";
import { buildSupplierRequest, customerBuyer, dispatchProblems, MAX_REQUEST_BYTES, requestBytes, supplierBuyer } from "./request";
import { isPermanentFailure, PermanentDispatchError } from "./retry-rules";
import { recordDispatchFailure } from "./retry-store";
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

/** En återförsäljares uppgifter som beställare hos verkstaden. */
async function resellerBuyer(tenant: string): Promise<SupplierBuyer> {
  return supplierBuyer(tenant, await getCompanyProfile(tenant), await accountEmail(tenant));
}

/**
 * Vem verkstaden fakturerar för en order (beslut av ägaren 2026-11-17):
 *
 * - En återförsäljares order faktureras alltid återförsäljaren, till inköpspris.
 * - En direktorder, lagd hos namnskylt.com utan återförsäljare, sköter verkstaden
 *   helt mot kunden: kunden är beställaren och betalar sitt eget pris.
 * - En order som kunden redan har betalat med kort till namnskylt.com faktureras
 *   inte en gång till: där är namnskylt.com beställaren, till inköpspris, som
 *   före direktordrarna. Kortbetalningen är avstängd och går inte ihop med att
 *   verkstaden sköter allt mot kunden.
 */
interface DispatchParty {
  buyer: SupplierBuyer;
  /** Satt på en direktorder. Bär namnskylt.coms egen adress, dit aviseringen går när skyltarna skickas till oss. */
  direct: { sellerEmail: string } | null;
}

/**
 * Parten för en order. `sellers` sparar återförsäljarnas uppgifter mellan
 * anropen, så att en lista med många ordrar läser varje företag en gång.
 */
export async function partyFor(
  order: Pick<StoredOrder, "resellerId" | "customer" | "delivery" | "payment">,
  sellers: Map<string, SupplierBuyer> = new Map(),
): Promise<DispatchParty> {
  let seller = sellers.get(order.resellerId);
  if (!seller) {
    seller = await resellerBuyer(order.resellerId);
    sellers.set(order.resellerId, seller);
  }
  if (!isDirectOrder(order)) return { buyer: seller, direct: null };
  return { buyer: customerBuyer(order.customer, order.delivery), direct: { sellerEmail: seller.contactEmail || seller.email } };
}

export function dispatchStatus(order: StoredOrder, party: DispatchParty | null): DispatchStatus {
  if (order.demo) return { state: "demo", problems: [] };
  if (order.supplierSentAt || isTrackableSupplierOrder(order.supplierOrderNo)) return { state: "sent", problems: [] };
  if (order.status === "cancelled") return { state: "cancelled", problems: [] };
  const problems = dispatchProblems(order, party?.buyer ?? null, Boolean(party?.direct));
  if (problems.length > 0) return { state: "blocked", problems };
  return { state: order.supplierError ? "failed" : "waiting", problems: [] };
}

/** Anropet till verkstaden för en order, som det skulle skickas nu. `null` när något saknas. */
export async function supplierRequestFor(order: StoredOrder, party: DispatchParty): Promise<SupplierOrderRequest | null> {
  if (!order.delivery || !order.purchaseList || dispatchProblems(order, party.buyer, Boolean(party.direct)).length > 0) return null;
  return buildSupplierRequest({
    orderNo: order.orderNo,
    project: order.project,
    customer: order.customer,
    buyer: party.buyer,
    delivery: order.delivery,
    // Verkstaden får bilden själv, inte adressen till den hos oss.
    badges: await withInlineLogoImages(order.badges),
    purchaseList: order.purchaseList,
    // På en direktorder betalar kunden sitt eget pris: prislistan och priserna ordern sparades med.
    ...(party.direct && { direct: { priceList: order.priceList, pricing: order.pricing, sellerEmail: party.direct.sellerEmail } }),
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
 * Ett fel sparas på ordern, som kan skickas igen från adminens översikt. Ett
 * fel som kan gå över (nätfel, fel hos verkstaden) provas också igen av
 * schemat (`retryFailedDispatches`); ett nej från verkstaden gör det inte.
 */
export async function dispatchOrder(orderNo: string): Promise<DispatchOutcome> {
  if (!supplierApiConfigured()) return { ok: false, reason: "not-configured", error: "Kopplingen till verkstaden är inte aktiverad" };
  const order = await getOrderForDispatch(orderNo);
  if (!order) return { ok: false, reason: "failed", error: "Ordern finns inte" };
  if (order.supplierSentAt && order.supplierOrderNo) return { ok: true, supplierOrderNo: order.supplierOrderNo };
  const party = await partyFor(order);
  const status = dispatchStatus(order, party);
  if (status.state === "demo") return { ok: false, reason: "blocked", error: "Demoordrar skickas inte till verkstaden" };
  if (status.state === "cancelled") return { ok: false, reason: "blocked", error: "Ordern är avbruten" };
  if (status.state === "blocked") return { ok: false, reason: "blocked", error: status.problems.join(". ") };
  if (!(await claimForDispatch(order.id))) return { ok: false, reason: "busy", error: "Ordern skickas redan" };
  try {
    const request = await supplierRequestFor(order, party);
    if (!request) throw new PermanentDispatchError("Ordern går inte att skicka");
    const bytes = requestBytes(request);
    if (bytes > MAX_REQUEST_BYTES) {
      throw new PermanentDispatchError(`Ordern är för stor för ett anrop (${(bytes / 1_000_000).toFixed(1)} MB). Dela upp den i flera ordrar.`);
    }
    const receipt = await createSupplierClient().placeOrder(request);
    await markDispatched(order.id, receipt.orderNumber);
    return { ok: true, supplierOrderNo: receipt.orderNumber, estimatedShipDate: receipt.estimatedShipDate };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Okänt fel";
    console.error(`Order ${orderNo} kunde inte skickas till verkstaden`, error);
    await recordDispatchFailure(requireDb(), order.id, message, isPermanentFailure(error));
    return { ok: false, reason: "failed", error: message };
  }
}
