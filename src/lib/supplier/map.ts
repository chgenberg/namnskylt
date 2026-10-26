import {
  getFont,
  getMaterial,
  getMounting,
  layoutBadge,
  type BadgeDocument,
  type FontEngine,
} from "@/engine";
import type { SupplierLayer, SupplierSignDocument } from "./types";

/** Skyltmotorns standardradhöjd; påverkar inget här eftersom varje lager har en rad. */
const SUPPLIER_LINE_HEIGHT_RATIO = 1.2;

/**
 * Översätter en namnskylt till leverantörens dokument. Varje rad blir ett eget
 * textlager på den position vår layout räknat fram, med den versalhöjd som
 * faktiskt ritades — så gravyren blir exakt det kunden såg, även när en rad
 * krympts för att rymmas.
 */
export function toSupplierSignDocument(
  doc: BadgeDocument,
  fonts: FontEngine,
): SupplierSignDocument {
  const layout = layoutBadge(doc, fonts);
  const font = getFont(doc.font);
  const { widthMm, heightMm } = doc.size;

  const textLayers: SupplierLayer[] = layout.rows.map((row) => ({
    id: `text-${row.id}`,
    transform: {
      position: { x: row.xMm, y: row.baselineMm - row.capHeightMm / 2 },
      rotationDeg: 0,
    },
    visible: true,
    locked: false,
    data: {
      kind: "text",
      font: font.id,
      lineHeightRatio: SUPPLIER_LINE_HEIGHT_RATIO,
      rows: [
        {
          id: row.id,
          text: row.text,
          capHeightMm: Number(row.capHeightMm.toFixed(2)),
          align: doc.align,
          bold: row.bold,
          italic: false,
          locked: false,
        },
      ],
    },
  }));

  const frameLayers: SupplierLayer[] =
    doc.frame.style === "none"
      ? []
      : [
          {
            id: "frame",
            transform: { position: { x: widthMm / 2, y: heightMm / 2 }, rotationDeg: 0 },
            visible: true,
            locked: false,
            data: {
              kind: "frame",
              thicknessMm: doc.frame.thicknessMm,
              paddingMm: doc.frame.insetMm,
              style: doc.frame.style,
            },
          },
        ];

  return {
    productType: "sign",
    material: getMaterial(doc.materialId).supplierCode,
    color: doc.colorId,
    shape: doc.shape === "oval" ? "oval" : "rectangular",
    dimensions: { widthMm, heightMm, autoSize: false },
    cornerRadiusMm: doc.shape === "rounded" ? doc.cornerRadiusMm : 0,
    // Fästet ligger inte i skyltmotorns hålmodell — det skickas som namn tills
    // leverantören har en artikelkod per fäste.
    mounting: getMounting(doc.mounting).name,
    holes: { type: "none", count: 0, diameterMm: 3.2, placement: "none" },
    layers: [...frameLayers, ...textLayers],
  };
}
