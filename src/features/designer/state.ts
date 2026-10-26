import {
  SIZE_LIMITS,
  TEXT_LIMITS,
  createRow,
  getMaterial,
  type BadgeDocument,
  type BadgeShape,
  type FontId,
  type FrameStyle,
  type MaterialId,
  type MountingId,
  type TextAlign,
} from "@/engine";

export type DesignerAction =
  | { type: "row/text"; id: string; text: string }
  | { type: "row/cap"; id: string; capHeightMm: number }
  | { type: "row/bold"; id: string }
  | { type: "row/add"; id: string }
  | { type: "row/remove"; id: string }
  | { type: "font"; font: FontId }
  | { type: "align"; align: TextAlign }
  | { type: "material"; materialId: MaterialId }
  | { type: "color"; colorId: string }
  | { type: "shape"; shape: BadgeShape }
  | { type: "size"; widthMm?: number; heightMm?: number }
  | { type: "corner"; cornerRadiusMm: number }
  | { type: "frame"; style: FrameStyle }
  | { type: "mounting"; mounting: MountingId }
  | { type: "quantity"; quantity: number };

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function mapRow(
  doc: BadgeDocument,
  id: string,
  update: (row: BadgeDocument["rows"][number]) => BadgeDocument["rows"][number],
): BadgeDocument {
  return { ...doc, rows: doc.rows.map((row) => (row.id === id ? update(row) : row)) };
}

export function designerReducer(doc: BadgeDocument, action: DesignerAction): BadgeDocument {
  switch (action.type) {
    case "row/text":
      return mapRow(doc, action.id, (row) => ({
        ...row,
        text: action.text.slice(0, TEXT_LIMITS.maxChars),
      }));
    case "row/cap":
      return mapRow(doc, action.id, (row) => ({
        ...row,
        capHeightMm: clamp(action.capHeightMm, TEXT_LIMITS.minCapHeightMm, TEXT_LIMITS.maxCapHeightMm),
      }));
    case "row/bold":
      return mapRow(doc, action.id, (row) => ({ ...row, bold: !row.bold }));
    case "row/add":
      if (doc.rows.length >= TEXT_LIMITS.maxRows) return doc;
      return {
        ...doc,
        rows: [...doc.rows, createRow(doc.rows.length, "", action.id)],
      };
    case "row/remove":
      if (doc.rows.length <= 1) return doc;
      return { ...doc, rows: doc.rows.filter((row) => row.id !== action.id) };
    case "font":
      return { ...doc, font: action.font };
    case "align":
      return { ...doc, align: action.align };
    case "material": {
      const { colors } = getMaterial(action.materialId);
      const colorId = colors.some((c) => c.id === doc.colorId) ? doc.colorId : colors[0]!.id;
      return { ...doc, materialId: action.materialId, colorId };
    }
    case "color":
      return { ...doc, colorId: action.colorId };
    case "shape":
      return { ...doc, shape: action.shape };
    case "size":
      return {
        ...doc,
        size: {
          widthMm: clamp(action.widthMm ?? doc.size.widthMm, SIZE_LIMITS.minWidthMm, SIZE_LIMITS.maxWidthMm),
          heightMm: clamp(
            action.heightMm ?? doc.size.heightMm,
            SIZE_LIMITS.minHeightMm,
            SIZE_LIMITS.maxHeightMm,
          ),
        },
      };
    case "corner":
      return { ...doc, cornerRadiusMm: clamp(action.cornerRadiusMm, 0, 30) };
    case "frame":
      return { ...doc, frame: { ...doc.frame, style: action.style } };
    case "mounting":
      return { ...doc, mounting: action.mounting };
    case "quantity":
      return { ...doc, quantity: clamp(Math.round(action.quantity) || 1, 1, 10_000) };
  }
}
