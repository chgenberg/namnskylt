import {
  CUSTOM_SHAPE_LIMITS,
  LOGO_LIMITS,
  TEXT_LIMITS,
  createRow,
  getMaterial,
  mountingFits,
  resizeCustomShape,
  withBlank,
  withShapePreset,
  type BadgeDocument,
  type BadgeLogo,
  type BlankId,
  type FontId,
  type FrameStyle,
  type LogoPlacement,
  type MaterialId,
  type MountingId,
  type Offset,
  type TextAlign,
  withTexts,
} from "@/engine";

export type DesignerAction =
  | { type: "row/text"; id: string; text: string }
  /** Alla rader på en gång, med skyltens stil — när en kollegas skylt öppnas. */
  | { type: "texts"; texts: string[] }
  | { type: "row/cap"; id: string; capHeightMm: number }
  | { type: "row/bold"; id: string }
  | { type: "row/add"; id: string }
  | { type: "row/remove"; id: string }
  | { type: "font"; font: FontId }
  | { type: "align"; align: TextAlign }
  | { type: "material"; materialId: MaterialId }
  | { type: "color"; colorId: string }
  | { type: "blank"; blankId: BlankId }
  /** Egen form: börja från ett formförslag, i förslagets mått. */
  | { type: "custom/preset"; presetId: string }
  /** Egen form: konturens punkter efter att kunden dragit, lagt till eller tagit bort en punkt. */
  | { type: "custom/outline"; points: { x: number; y: number }[] }
  /** Egen form: nytt mått; konturen skalas med. */
  | { type: "custom/size"; widthMm?: number; heightMm?: number }
  /** Egen form från en uppladdad fil: kontur och mått på en gång. */
  | { type: "custom/replace"; points: { x: number; y: number }[]; widthMm: number; heightMm: number }
  | { type: "corner"; cornerRadiusMm: number }
  | { type: "frame"; style: FrameStyle }
  | { type: "logo"; logo: BadgeLogo | null }
  /** Originalfilen är sparad på servern. `d` pekar ut loggan den hör till. */
  | { type: "logo/original"; d: string; originalId: string }
  | { type: "logo/placement"; placement: LogoPlacement }
  | { type: "logo/height"; heightMm: number }
  | { type: "move"; target: "text" | "logo"; offset: Offset }
  | { type: "move/reset" }
  | { type: "mounting"; mounting: MountingId }
  | { type: "quantity"; quantity: number }
  /** Byter hela skylten, när en annan design i ordern öppnas i editorn. */
  | { type: "load"; doc: BadgeDocument };

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
    case "texts":
      return withTexts(
        doc,
        action.texts.slice(0, TEXT_LIMITS.maxRows).map((text) => text.slice(0, TEXT_LIMITS.maxChars)),
      );
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
      const material = getMaterial(action.materialId);
      const colorId = material.colors.some((c) => c.id === doc.colorId) ? doc.colorId : material.colors[0]!.id;
      // Ett fäste som inte finns på det nya materialet (klämman på metall) byts mot nålen.
      const mounting = mountingFits(doc.mounting, action.materialId) ? doc.mounting : "pin";
      const next = { ...doc, materialId: action.materialId, colorId, mounting };
      // Bara material som skärs ur ark kan ha en egen form; annars tillbaka till ett ämne.
      return next.shape === "custom" && !material.customShape ? withBlank(next, "rectangle") : next;
    }
    case "color":
      return { ...doc, colorId: action.colorId };
    case "blank":
      return withBlank(doc, action.blankId);
    case "custom/preset":
      return getMaterial(doc.materialId).customShape ? withShapePreset(doc, action.presetId) : doc;
    case "custom/outline":
      return doc.shape === "custom" ? { ...doc, customOutline: action.points } : doc;
    case "custom/size":
      return resizeCustomShape(doc, action);
    case "custom/replace":
      // En fil som lästs klart efter att kunden bytt till metall får inte ge en ogiltig skylt.
      if (!getMaterial(doc.materialId).customShape) return doc;
      return resizeCustomShape(
        { ...doc, shape: "custom", size: { widthMm: action.widthMm, heightMm: action.heightMm }, customOutline: action.points },
        {},
      );
    case "corner":
      return { ...doc, cornerRadiusMm: clamp(action.cornerRadiusMm, 0, CUSTOM_SHAPE_LIMITS.maxCornerRadiusMm) };
    case "frame":
      return { ...doc, frame: { ...doc.frame, style: action.style } };
    case "logo": {
      if (action.logo) return { ...doc, logo: action.logo };
      const rest = { ...doc };
      delete rest.logo;
      return rest;
    }
    case "logo/original":
      // Svaret kommer i efterhand: har kunden bytt eller tagit bort loggan under tiden gäller det inte längre.
      return doc.logo && doc.logo.d === action.d ? { ...doc, logo: { ...doc.logo, originalId: action.originalId } } : doc;
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
      // Ett fäste som inte finns på materialet går inte att välja, hur klicket än kom hit.
      return mountingFits(action.mounting, doc.materialId) ? { ...doc, mounting: action.mounting } : doc;
    case "quantity":
      return { ...doc, quantity: clamp(Math.round(action.quantity) || 1, 1, 10_000) };
    case "load":
      return action.doc;
  }
}
