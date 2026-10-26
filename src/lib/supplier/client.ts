import "server-only";
import type { SupplierClient, SupplierOrderReceipt, SupplierOrderRequest } from "./types";

const PRODUCTION_DAYS = 5;
const REQUEST_TIMEOUT_MS = 15_000;

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
      estimatedShipDate: shipDate(new Date(), PRODUCTION_DAYS),
    };
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
      },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Leverantören svarade ${response.status}: ${detail.slice(0, 300)}`);
    }
    return (await response.json()) as SupplierOrderReceipt;
  }
}

export function createSupplierClient(): SupplierClient {
  const url = process.env.SUPPLIER_API_URL;
  const key = process.env.SUPPLIER_API_KEY;
  return url && key ? new HttpSupplierClient(url, key) : new MockSupplierClient();
}
