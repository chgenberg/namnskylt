/**
 * Kontraktet mot Skylt & Gravyrteknik. Dokumentformen är en delmängd av
 * skyltmotorns `SignDocument` (productType "sign"), så leverantören kan
 * produktionsrendera ordern med sin befintliga motor.
 */

export interface SupplierTextRow {
  id: string;
  text: string;
  capHeightMm: number;
  align: "left" | "center" | "right";
  bold: boolean;
  italic: false;
  locked: false;
}

export type SupplierLayer =
  | {
      id: string;
      transform: { position: { x: number; y: number }; rotationDeg: 0 };
      visible: true;
      locked: false;
      data: { kind: "text"; rows: SupplierTextRow[]; font: string; lineHeightRatio: number };
    }
  | {
      id: string;
      transform: { position: { x: number; y: number }; rotationDeg: 0 };
      visible: true;
      locked: false;
      data: { kind: "frame"; thicknessMm: number; paddingMm: number; style: "solid" | "double" };
    };

export interface SupplierSignDocument {
  productType: "sign";
  material: string;
  color: string;
  shape: "rectangular" | "oval";
  dimensions: { widthMm: number; heightMm: number; autoSize: false };
  cornerRadiusMm: number;
  mounting: string;
  holes: { type: "none"; count: 0; diameterMm: number; placement: "none" };
  layers: SupplierLayer[];
  productionNote?: string;
}

export interface SupplierOrderLine {
  document: SupplierSignDocument;
  quantity: number;
  /** Vår referens per rad, återkommer i leverantörens följesedel. */
  reference: string;
  /**
   * Färdig produktionsfil i mm med glyferna som konturer (röd = skär,
   * svart = gravyr) — facit om leverantörens rendering skulle skilja.
   */
  productionSvg: string;
}

export interface SupplierCustomer {
  name: string;
  email: string;
  company?: string;
}

export interface SupplierOrderRequest {
  customer: SupplierCustomer;
  lines: SupplierOrderLine[];
}

export interface SupplierOrderReceipt {
  orderNumber: string;
  status: "received" | "mock";
  estimatedShipDate: string;
}

export interface SupplierClient {
  placeOrder(request: SupplierOrderRequest): Promise<SupplierOrderReceipt>;
}
