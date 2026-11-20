import {
  CUSTOM_SHAPE_LIMITS,
  LOGO_LIMITS,
  TEXT_LIMITS,
  blankFits,
  withLogoColors,
  clipOrientations,
  createRow,
  getBlank,
  getMaterial,
  markingFits,
  printHex,
  mountingFitsDocument,
  resizeCustomShape,
  withBlank,
  withFittingBlank,
  withFittingFrame,
  withFittingMounting,
  withTextColor,
  withVisibleInk,
  withLogoMarking,
  withMarking,
  withMounting,
  withShapePreset,
  type BadgeDocument,
  type BadgeLogo,
  type BlankId,
  type ClipOrientation,
  type FontId,
  type FrameStyle,
  type LogoPlacement,
  type MarkingMethod,
  type MaterialId,
  type MountingId,
  type Offset,
  type TextAlign,
  withTexts,
  offeredColors,
  frameFits,
  isPrintOnly,
  withMaterialMarking,
} from "@/engine";

export type DesignerAction =
  | { type: "row/text"; id: string; text: string }
  /** Alla rader på en gång, med skyltens stil — när en kollegas skylt öppnas. */
  | { type: "texts"; texts: string[] }
  | { type: "row/cap"; id: string; capHeightMm: number }
  /** Hela textens storlek, dragen i ritningen: versalhöjden för varje rad som har text. */
  | { type: "rows/caps"; caps: readonly { id: string; capHeightMm: number }[] }
  | { type: "row/bold"; id: string }
  /** Radens egen färg i trycket, som `#RRGGBB`. `null` tar bort den, och raden får tryckets färg. */
  | { type: "row/color"; id: string; color: string | null }
  | { type: "row/add"; id: string }
  | { type: "row/remove"; id: string }
  | { type: "font"; font: FontId }
  | { type: "align"; align: TextAlign }
  /** `colorId`: ytan eller färgen skylten hade senast på det materialet, så att ett byte tillbaka ger samma skylt. */
  | { type: "material"; materialId: MaterialId; colorId?: string }
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
  /** `keepMarking`: samma logga i en ny form ("Invertera"), så metoden kunden har valt står kvar. */
  | { type: "logo"; logo: BadgeLogo | null; keepMarking?: boolean }
  /** Gravyrformen till en logga i färg som saknade den, räknad i efterhand ur bilden. `d` pekar ut loggan. */
  | { type: "logo/engraving"; d: string; engraveD: string }
  /** Originalfilen är sparad på servern. `d` pekar ut loggan den hör till. */
  | { type: "logo/original"; d: string; originalId: string }
  | { type: "logo/placement"; placement: LogoPlacement }
  | { type: "logo/height"; heightMm: number }
  /** Loggans avlästa färger, rättade av kunden. Bara skärmfärger sparas. */
  | { type: "logo/colors"; colors: string[] }
  /** Kunden väljer hur namn och logotyp märks. Ett kombinerat val kräver en logga. */
  | { type: "marking"; method: MarkingMethod }
  /** Textfärgen för allt som printas, som `#RRGGBB`. Den gäller alla rader. `null` tar bort den, och trycket får ytans förvalda färg. */
  | { type: "print/color"; color: string | null }
  | { type: "move"; target: "text" | "logo"; offset: Offset }
  | { type: "move/reset" }
  | { type: "mounting"; mounting: MountingId }
  /** Klämmans riktning. Gäller bara när fästet är klämma och riktningen ryms på skylten. */
  | { type: "clip/orientation"; orientation: ClipOrientation }
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

/**
 * Färgen som sparas: en skärmfärg, `#RRGGBB`, eller `null` för ingen. `undefined` när värdet
 * inte är en färg, och då ändras ingenting. Tryckets färger är skärmfärger, som hos
 * Skylt & Gravyrteknik (beslut av ägaren 2026-11-18).
 */
function screenColor(color: string | null): string | null | undefined {
  if (color === null) return null;
  return printHex(color) ?? undefined;
}

/** Skylten eller raden med sin färg för trycket. Utan färg är fältet borta, inte tomt. */
function withPrintColor<T extends { printColor?: string }>(item: T, color: string | null): T {
  const rest = { ...item };
  delete rest.printColor;
  return color ? { ...rest, printColor: color } : rest;
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
    case "rows/caps": {
      const caps = new Map(action.caps.map((cap) => [cap.id, cap.capHeightMm]));
      return {
        ...doc,
        rows: doc.rows.map((row) => {
          const cap = caps.get(row.id);
          // En tiondels millimeter, som reglaget för versalhöjd.
          return cap === undefined
            ? row
            : { ...row, capHeightMm: clamp(Math.round(cap * 10) / 10, TEXT_LIMITS.minCapHeightMm, TEXT_LIMITS.maxCapHeightMm) };
        }),
      };
    }
    case "row/bold":
      return mapRow(doc, action.id, (row) => ({ ...row, bold: !row.bold }));
    case "row/color": {
      const color = screenColor(action.color);
      return color === undefined ? doc : mapRow(doc, action.id, (row) => withPrintColor(row, color));
    }
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
      // Bara färger som säljs: en kombination som har utgått följer inte med till ett annat material.
      const colors = offeredColors(material);
      const sold = (id: string | undefined) => (id && colors.some((c) => c.id === id) ? id : null);
      // Samma kombination om den finns på materialet, annars den skylten hade där senast, annars materialets första.
      const colorId = sold(doc.colorId) ?? sold(action.colorId) ?? colors[0]!.id;
      const moved = { ...doc, materialId: action.materialId, colorId };
      // Metoden följer materialet: metall går bara att printa på, och plasten börjar om på gravyr
      // när skylten kommer från metall. Samma material behåller kundens val.
      const next = isPrintOnly(action.materialId) || isPrintOnly(doc.materialId) ? withMaterialMarking(moved) : moved;
      // Metallens och plastens ämnen har olika mått, och bara material som skärs ur ark kan ha en
      // egen form: skylten flyttas till närmaste ämne på det nya materialet (`withFittingBlank`).
      // Ett fäste som inte går att få på den nya skylten (klämman på metall) byts mot nålen,
      // och ramen, som bara finns på plast, tas bort på metall. En textfärg som inte syns mot
      // den nya ytan tas bort, så att namnet inte försvinner.
      return withVisibleInk(withFittingFrame(withFittingMounting(withFittingBlank(next))));
    }
    case "color":
      // En textfärg som inte syns mot den nya ytan tas bort, så att namnet inte försvinner.
      return withVisibleInk({ ...doc, colorId: action.colorId });
    case "blank":
      // Ett ämne som inte finns på materialet går inte att välja, hur klicket än kom hit.
      // Formen ändrar måttet: en klämma som inte längre ryms byts mot nålen.
      return blankFits(getBlank(action.blankId), doc.materialId) ? withFittingMounting(withBlank(doc, action.blankId)) : doc;
    case "custom/preset":
      return getMaterial(doc.materialId).customShape ? withFittingMounting(withShapePreset(doc, action.presetId)) : doc;
    case "custom/outline":
      return doc.shape === "custom" ? { ...doc, customOutline: action.points } : doc;
    case "custom/size":
      return withFittingMounting(resizeCustomShape(doc, action));
    case "custom/replace":
      // En fil som lästs klart efter att kunden bytt till metall får inte ge en ogiltig skylt.
      if (!getMaterial(doc.materialId).customShape) return doc;
      return withFittingMounting(
        resizeCustomShape(
          { ...doc, shape: "custom", size: { widthMm: action.widthMm, heightMm: action.heightMm }, customOutline: action.points },
          {},
        ),
      );
    case "corner":
      return { ...doc, cornerRadiusMm: clamp(action.cornerRadiusMm, 0, CUSTOM_SHAPE_LIMITS.maxCornerRadiusMm) };
    case "frame":
      // Ramen finns bara på plast: på metall går den inte att välja.
      return frameFits(doc.materialId) ? { ...doc, frame: { ...doc.frame, style: action.style } } : doc;
    case "logo": {
      // En ny logga får ett förslag på metod: i färg printas den, svartvit följer den namnet. Kunden kan byta sedan.
      // Samma logga i en ny form ("Invertera") behåller metoden kunden har valt.
      // Färgerna kunden har rättat står också kvar: det är samma logga.
      if (action.logo && action.keepMarking && doc.logo) {
        return { ...doc, logo: { ...action.logo, ...(doc.logo.colors && { colors: doc.logo.colors }) } };
      }
      if (action.logo) return withLogoMarking({ ...doc, logo: action.logo });
      const rest = { ...doc };
      delete rest.logo;
      // Utan logga finns bara namnets metod kvar; ett kombinerat val faller tillbaka dit.
      return withLogoMarking(rest);
    }
    case "marking":
      return markingFits(action.method, doc) ? withMarking(doc, action.method) : doc;
    case "print/color":
      // Textfärgen gäller alla rader: radernas egna färger tas bort, så att valet alltid syns.
      return withTextColor(doc, action.color);
    case "logo/colors":
      // Färgerna som lästes av från början sparas vid den första ändringen, så att de går att återställa.
      return doc.logo ? { ...doc, logo: withLogoColors(doc.logo, action.colors) } : doc;
    case "logo/engraving":
      // Svaret kommer i efterhand: gäller bara om samma logga ligger kvar och fortfarande saknar gravyrform.
      return doc.logo && doc.logo.d === action.d && !doc.logo.engraveD
        ? { ...doc, logo: { ...doc.logo, engraveD: action.engraveD } }
        : doc;
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
              // Kunden har själv satt storleken: loggan får ta mer av skylten än den automatiska placeringen ger.
              sizing: "free" as const,
            },
          }
        : doc;
    case "mounting":
      // Ett fäste som inte går att få på skylten går inte att välja, hur klicket än kom hit.
      return mountingFitsDocument(doc, action.mounting) ? withMounting(doc, action.mounting) : doc;
    case "clip/orientation":
      return doc.mounting === "clip" && clipOrientations(doc.size).includes(action.orientation)
        ? { ...doc, clipOrientation: action.orientation }
        : doc;
    case "quantity":
      return { ...doc, quantity: clamp(Math.round(action.quantity) || 1, 1, 10_000) };
    case "load":
      return action.doc;
  }
}
