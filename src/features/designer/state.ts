import {
  LOGO_LIMITS,
  SIZE_LIMITS,
  TEXT_LIMITS,
  createRow,
  getMaterial,
  type BadgeDocument,
  type BadgeLogo,
  type BadgeShape,
  type FontId,
  type FrameStyle,
  type LogoPlacement,
  type MaterialId,
  type MountingId,
  type Offset,
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
  | { type: "logo"; logo: BadgeLogo | null }
  | { type: "logo/placement"; placement: LogoPlacement }
  | { type: "logo/height"; heightMm: number }
  | { type: "move"; target: "text" | "logo"; offset: Offset }
  | { type: "move/reset" }
  | { type: "mounting"; mounting: MountingId }
  | { type: "quantity"; quantity: number };

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Tiondels millimeter räcker för gravyren och håller dokumentet läsbart. */
function roundOffset({ xMm, yMm }: Offset): Offset {
  return { xMm: Math.round(xMm * 10) / 10, yMm: Math.round(yMm * 10) / 10 };
}

function withoutOffsets(doc: BadgeDocument): BadgeDocument {
  const rest = { ...doc };
  delete rest.textOffsetMm;
  if (!rest.logo?.offsetMm) return rest;
  const logo = { ...rest.logo };
  delete logo.offsetMm;
  return { ...rest, logo };
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
    case "align": {
      const offset = doc.textOffsetMm;
      // Justeringen bestämmer var i sidled texten står; en tidigare dragning i sidled släpps.
      return { ...doc, align: action.align, ...(offset && { textOffsetMm: { xMm: 0, yMm: offset.yMm } }) };
    }
    case "move": {
      const offset = roundOffset(action.offset);
      if (action.target === "text") return { ...doc, textOffsetMm: offset };
      return doc.logo ? { ...doc, logo: { ...doc.logo, offsetMm: offset } } : doc;
    }
    case "move/reset":
      return withoutOffsets(doc);
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
    case "logo": {
      if (action.logo) return { ...doc, logo: action.logo };
      const rest = { ...doc };
      delete rest.logo;
      return rest;
    }
    case "logo/placement": {
      // Ny placering = ny automatisk layout att utgå från.
      const reset = withoutOffsets(doc);
      return reset.logo ? { ...reset, logo: { ...reset.logo, placement: action.placement } } : doc;
    }
    case "logo/height":
      return doc.logo
        ? {
            ...doc,
            logo: {
              ...doc.logo,
              heightMm: clamp(action.heightMm, LOGO_LIMITS.minHeightMm, LOGO_LIMITS.maxHeightMm),
            },
          }
        : doc;
    case "mounting":
      return { ...doc, mounting: action.mounting };
    case "quantity":
      return { ...doc, quantity: clamp(Math.round(action.quantity) || 1, 1, 10_000) };
  }
}
