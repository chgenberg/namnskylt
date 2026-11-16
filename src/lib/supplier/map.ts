import {
  effectiveCornerRadius,
  MARKING_MODE_NAME,
  getFont,
  getMarkingMethod,
  getMaterial,
  mountingLabel,
  printColorLabel,
  hasStraightSides,
  layoutBadge,
  logoEngravingPath,
  logoMarking,
  markingOf,
  nameMarking,
  type BadgeDocument,
  type BadgeShape,
  type FontEngine,
} from "@/engine";
import type { SupplierLayer, SupplierSignDocument } from "./types";

/**
 * Skyltmotorn har ingen egen kapselform — den är en rektangel med radien h/2.
 * Kudden saknas också där. Ämnet är färdigskuret, så konturen skärs aldrig:
 * den skickas som rektangel och bara gravyrens läge används. En egen form
 * skickas som skyltmotorns fria polygon ("freeform") med sina punkter.
 */
function supplierShape(shape: BadgeShape): SupplierSignDocument["shape"] {
  if (shape === "custom") return "freeform";
  return hasStraightSides(shape) || shape === "cushion" ? "rectangular" : shape;
}

/**
 * Märkningsmetoden i klartext. Skyltmotorns text- och ramlager har inget läge
 * för gravyr eller print, så ett printat namn går bara att säga så här tills
 * leverantörens format har fältet. Loggans lager bär sitt läge själv.
 */
function markingNote(doc: BadgeDocument): string {
  const parts = [`Namn: ${MARKING_MODE_NAME[nameMarking(doc)]}`];
  if (doc.logo) parts.push(`Logotyp: ${MARKING_MODE_NAME[logoMarking(doc)]}`);
  const color = printColorLabel(doc);
  if (color) parts.push(color);
  return `Märkningsmetod: ${getMarkingMethod(markingOf(doc)).name}. ${parts.join(". ")}.`;
}

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
  assets: { logoPng?: string } = {},
): SupplierSignDocument {
  const layout = layoutBadge(doc, fonts);
  const font = getFont(doc.font);
  const { widthMm, heightMm } = doc.size;
  const method = markingOf(doc);

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

  const logoLayers: SupplierLayer[] =
    doc.logo && layout.logo
      ? [
          {
            id: "logo",
            transform: {
              position: {
                x: Number((layout.logo.x + layout.logo.width / 2).toFixed(3)),
                y: Number((layout.logo.y + layout.logo.height / 2).toFixed(3)),
              },
              rotationDeg: 0,
            },
            visible: true,
            locked: false,
            // En logga som printas skickas som bild: loggan i färg som den är, en svartvit som sin miniatyr.
            // En logga som graveras skickas med sina banor.
            data: layout.logo.printed
              ? {
                  kind: "image",
                  src: doc.logo.image?.src ?? assets.logoPng ?? "",
                  widthMm: Number(layout.logo.width.toFixed(3)),
                  heightMm: Number(layout.logo.height.toFixed(3)),
                  renderMode: "print",
                  lockAspect: true,
                }
              : {
                  kind: "image",
                  src: assets.logoPng ?? "",
                  widthMm: Number(layout.logo.width.toFixed(3)),
                  heightMm: Number(layout.logo.height.toFixed(3)),
                  renderMode: "engrave",
                  lockAspect: true,
                  vector: {
                    markup: `<path d="${logoEngravingPath(doc.logo)}" fill="#000000" fill-rule="evenodd"/>`,
                    viewWidth: doc.logo.viewWidth,
                    viewHeight: doc.logo.viewHeight,
                  },
                },
          },
        ]
      : [];

  return {
    productType: "sign",
    material: getMaterial(doc.materialId).supplierCode,
    color: doc.colorId,
    shape: supplierShape(doc.shape),
    dimensions: { widthMm, heightMm, autoSize: false },
    cornerRadiusMm: hasStraightSides(doc.shape)
      ? Number(effectiveCornerRadius(doc).toFixed(2))
      : doc.shape === "custom"
        ? doc.cornerRadiusMm
        : 0,
    ...(doc.shape === "custom" && { customShapePoints: doc.customOutline ?? [] }),
    // Fästet ligger inte i skyltmotorns hålmodell — det skickas som namn tills
    // leverantören har en artikelkod per fäste.
    mounting: mountingLabel(doc),
    holes: { type: "none", count: 0, diameterMm: 3.2, placement: "none" },
    layers: [...frameLayers, ...logoLayers, ...textLayers],
    ...(method !== "engrave" && { productionNote: markingNote(doc) }),
  };
}
