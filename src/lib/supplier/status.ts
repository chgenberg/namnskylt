import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { OrderStatus } from "@/lib/orders/model";
import { SUPPLIER_ORDER_STATUSES, type SupplierOrderState, type SupplierOrderStatus } from "./types";

export const supplierOrderStateSchema = z.object({
  orderNumber: z.string().trim().min(1).max(64),
  status: z.enum(SUPPLIER_ORDER_STATUSES),
  trackingUrl: z.url().max(500).nullish(),
  changedAt: z.iso.datetime({ offset: true }),
}) satisfies z.ZodType<SupplierOrderState>;

/**
 * Leverantörens steg i vår tidslinje. Mottagen och granskning hos dem ändrar
 * inget — ordern är redan "Mottagen" (eller "Godkänd" efter korrekturen) hos oss.
 */
const STATUS_FROM_SUPPLIER: Record<SupplierOrderStatus, OrderStatus | null> = {
  draft: null,
  submitted: null,
  in_review: null,
  in_production: "in-production",
  completed: "in-production",
  shipped: "shipped",
  delivered: "delivered",
  cancelled: "cancelled",
};

export function toOrderStatus(status: SupplierOrderStatus): OrderStatus | null {
  return STATUS_FROM_SUPPLIER[status];
}

const PROGRESS: Record<OrderStatus, number> = {
  received: 0,
  "proof-sent": 1,
  approved: 2,
  "in-production": 3,
  shipped: 4,
  delivered: 5,
  cancelled: 6,
};

/** Bara framåt: en sen eller dubblerad händelse får aldrig backa tidslinjen. */
export function advancesTo(current: OrderStatus, next: OrderStatus): boolean {
  if (current === "cancelled" || current === "delivered") return false;
  if (next === "cancelled") return current !== "shipped";
  return PROGRESS[next] > PROGRESS[current];
}

/** Ordrar som aldrig gick till leverantörens riktiga API. */
export function isTrackableSupplierOrder(supplierOrderNo: string | null): supplierOrderNo is string {
  return !!supplierOrderNo && supplierOrderNo !== "DEMO" && !supplierOrderNo.startsWith("MOCK-");
}

export const SIGNATURE_HEADER = "x-supplier-signature";
export const SIGNATURE_TOLERANCE_SECONDS = 300;

/** `t=<unix-sekunder>,v1=<hex HMAC-SHA256 av "t.kropp">` — tiden stoppar återspelning. */
export function signWebhook(body: string, secret: string, timestampSeconds: number): string {
  const digest = createHmac("sha256", secret).update(`${timestampSeconds}.${body}`).digest("hex");
  return `t=${timestampSeconds},v1=${digest}`;
}

export function verifyWebhookSignature(
  body: string,
  header: string | null,
  secret: string,
  nowSeconds: number,
): boolean {
  if (!header) return false;
  const parts = new Map(header.split(",").map((part) => part.trim().split("=", 2) as [string, string]));
  const timestamp = Number(parts.get("t"));
  const given = parts.get("v1");
  if (!Number.isInteger(timestamp) || !given) return false;
  if (Math.abs(nowSeconds - timestamp) > SIGNATURE_TOLERANCE_SECONDS) return false;
  const expected = signWebhook(body, secret, timestamp).split("v1=")[1] ?? "";
  const a = Buffer.from(given, "hex");
  const b = Buffer.from(expected, "hex");
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}
