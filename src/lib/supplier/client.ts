import "server-only";
import { SupplierHttpError } from "./retry-rules";
import { supplierOrderStateSchema } from "./status";
import type { SupplierClient, SupplierOrderReceipt, SupplierOrderRequest, SupplierOrderState } from "./types";

const PRODUCTION_DAYS = 5;
const REQUEST_TIMEOUT_MS = 15_000;
/** Statusen hämtas när sidan visas — den får inte hålla upp sidan länge. */
const STATUS_TIMEOUT_MS = 4_000;

/** Beräknat skickdatum för en order som läggs nu, tills verkstaden gett sitt eget. */
export function estimatedShipDate(now: Date = new Date()): string {
  return shipDate(now, PRODUCTION_DAYS);
}

function shipDate(fromDate: Date, workingDays: number): string {
  const date = new Date(fromDate);
  let remaining = workingDays;
  while (remaining > 0) {
    date.setDate(date.getDate() + 1);
    const day = date.getDay();
    if (day !== 0 && day !== 6) remaining--;
  }
  return date.toISOString().slice(0, 10);
}

class MockSupplierClient implements SupplierClient {
  async placeOrder(_request: SupplierOrderRequest): Promise<SupplierOrderReceipt> {
    return {
      orderNumber: `MOCK-${Date.now().toString(36).toUpperCase()}`,
      status: "mock",
      estimatedShipDate: estimatedShipDate(),
    };
  }

  async getOrder(_orderNumber: string): Promise<SupplierOrderState | null> {
    return null;
  }
}

class HttpSupplierClient implements SupplierClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  async placeOrder(request: SupplierOrderRequest): Promise<SupplierOrderReceipt> {
    const response = await fetch(new URL("/orders", this.baseUrl), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
        // Samma order får aldrig bli två hos leverantören, även om svaret tappas och vi försöker igen.
        "idempotency-key": request.orderRef,
      },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      // Statusen följer med felet: ett nej (4xx) provas inte om av sig självt, ett fel hos verkstaden (5xx) gör det.
      throw new SupplierHttpError(response.status, detail.slice(0, 300));
    }
    return (await response.json()) as SupplierOrderReceipt;
  }

  async getOrder(orderNumber: string): Promise<SupplierOrderState | null> {
    const response = await fetch(new URL(`/orders/${encodeURIComponent(orderNumber)}`, this.baseUrl), {
      headers: { authorization: `Bearer ${this.apiKey}` },
      signal: AbortSignal.timeout(STATUS_TIMEOUT_MS),
      cache: "no-store",
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Leverantören svarade ${response.status}`);
    return supplierOrderStateSchema.parse(await response.json());
  }
}

export function supplierApiConfigured(): boolean {
  return !!process.env.SUPPLIER_API_URL && !!process.env.SUPPLIER_API_KEY;
}

export function createSupplierClient(): SupplierClient {
  const url = process.env.SUPPLIER_API_URL;
  const key = process.env.SUPPLIER_API_KEY;
  return url && key ? new HttpSupplierClient(url, key) : new MockSupplierClient();
}
