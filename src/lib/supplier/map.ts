import {
  badgeOutline,
  blankArticleOf,
  effectiveCornerRadius,
  MARKING_MODE_NAME,
  getColor,
  getFont,
  getMarkingMethod,
  getMaterial,
  mountingLabel,
  engravingHex,
  printColorLabel,
  printedPaths,
  hasStraightSides,
  layoutBadge,
  logoEngravingPath,
  logoMarking,
  markingOf,
  nameMarking,
  type BadgeDocument,
  type BadgeLayout,
  type FontEngine,
} from "@/engine";
import { toCubicPath } from "./cubic-path";
import type { SupplierLayer, SupplierSignDocument } from "./types";

const round3 = (value: number) => Number(value.toFixed(3));

/**
 * Skyltens kontur som verkstaden skär den. Skyltmotorn har ingen egen
 * kapselform — den är en rektangel med radien h/2 — och ingen kudde.
 *
 * - En egen form skickas som skyltmotorns fria polygon ("freeform") med sina punkter.
 * - En kudde som skärs ur ark (plast) skickas också som fri polygon, med
 *   kuddens egna punkter, så att verkstaden skär just den formen.
 * - En kudde i ett färdigt ämne (metall) skärs aldrig: den skickas som
 *   rektangel och bara gravyrens läge används.
 */
function supplierOutline(doc: BadgeDocument): Pick<SupplierSignDocument, "shape" | "cornerRadiusMm" | "customShapePoints"> {
  const { shape } = doc;
  if (shape === "custom") {
    return { shape: "freeform", cornerRadiusMm: doc.cornerRadiusMm, customShapePoints: doc.customOutline ?? [] };
  }
  if (shape === "cushion") {
    const outline = getMaterial(doc.materialId).precut ? null : badgeOutline(doc);
    if (outline?.kind === "polygon") {
      const customShapePoints = outline.points.map((point) => ({ x: round3(point.x), y: round3(point.y) }));
      return { shape: "freeform", cornerRadiusMm: 0, customShapePoints };
    }
    return { shape: "rectangular", cornerRadiusMm: 0 };
  }
  if (hasStraightSides(shape)) return { shape: "rectangular", cornerRadiusMm: Number(effectiveCornerRadius(doc).toFixed(2)) };
  // Övriga former (oval, rund, månghörningar) heter likadant hos verkstaden.
  return { shape, cornerRadiusMm: 0 };
}

/**
 * Märkningsmetoden i klartext, så att verkstaden läser den på orderpappret.
 * `printedText` är skyltens rader när namnet skickas som banor i trycklagret:
 * då finns inget textlager hos verkstaden, och texten ska ändå gå att läsa.
 */
function markingNote(doc: BadgeDocument, printedText: readonly string[] = []): string {
  const parts = [`Namn: ${MARKING_MODE_NAME[nameMarking(doc)]}`];
  if (doc.logo) parts.push(`Logotyp: ${MARKING_MODE_NAME[logoMarking(doc)]}`);
  const color = printColorLabel(doc);
  if (color) parts.push(color);
  if (printedText.length > 0) parts.push(`Text som printas: ${printedText.join(" / ")}`);
  return `Märkningsmetod: ${getMarkingMethod(markingOf(doc)).name}. ${parts.join(". ")}.`;
}

/**
 * Allt som printas i en färg, som ett vektorlager i skyltmotorns tryckläge:
 * namnet, ramen och en svartvit logga, var och en i sin färg. Skyltmotorns
 * text- och ramlager har inget läge för print, men ett bildlager i tryckläge
 * hamnar i deras tryckfil och hålls utanför gravyrfilen. Därför skickas det
 * som printas som färdiga banor, i skyltens egna mm.
 *
 * Färgen är kundens CMYK- eller hexkod när den går att rita, annars färgen
 * skylten visades i. `null` när inget printas i en färg, eller när typsnittet
 * saknar konturer.
 */
function printLayer(doc: BadgeDocument, layout: BadgeLayout, fonts: FontEngine): SupplierLayer | null {
  // De flesta skyltar graveras bara: då behöver inga konturer räknas fram här.
  if (!layout.namePrinted && !layout.logo?.printed) return null;
  const paths = fonts.outline ? printedPaths(layout, fonts) : null;
  if (!paths || paths.length === 0) return null;
  const shownInk = engravingHex(getColor(doc.materialId, doc.colorId));
  let markup: string;
  try {
    markup = paths
      .map((path) => {
        const fill = (path.ink ?? shownInk).toLowerCase();
        return `<path d="${toCubicPath(path.d)}" fill="${fill}"${path.fillRule === "evenodd" ? ' fill-rule="evenodd"' : ""}/>`;
      })
      .join("");
  } catch {
    // En bana som inte går att räkna om (en logga med trasig bana) får inte stoppa ordern:
    // utan trycklager skickas namnet som text och loggan som miniatyr, som förut.
    return null;
  }
  const { widthMm, heightMm } = doc.size;
  return {
    id: "print",
    transform: { position: { x: widthMm / 2, y: heightMm / 2 }, rotationDeg: 0 },
    visible: true,
    locked: false,
    data: {
      kind: "image",
      src: "",
      widthMm,
      heightMm,
      renderMode: "print",
      lockAspect: true,
      vector: { markup, viewWidth: widthMm, viewHeight: heightMm },
    },
  };
}

/** Skyltmotorns standardradhöjd; påverkar inget här eftersom varje lager har en rad. */
const SUPPLIER_LINE_HEIGHT_RATIO = 1.2;

/**
 * Översätter en namnskylt till leverantörens dokument. Varje rad blir ett eget
 * textlager på den position vår layout räknat fram, med den versalhöjd som
 * faktiskt ritades — så gravyren blir exakt det kunden såg, även när en rad
 * krympts för att rymmas.
 *
 * Det som printas i en färg (namn, ram, svartvit logga) skickas i stället som
 * banor i ett trycklager, se `printLayer`. Då finns inget text- eller ramlager
 * för det i dokumentet, och texten står i `productionNote`.
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

  const print = printLayer(doc, layout, fonts);
  // Namnet och ramen ligger i trycklagret när namnet printas. Utan konturer (typsnittet inte laddat)
  // skickas de som förut, som text och ram, och metoden står bara i klartext.
  const nameInPrintLayer = print !== null && layout.namePrinted;

  const textLayers: SupplierLayer[] = (nameInPrintLayer ? [] : layout.rows).map((row) => ({
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
          // Fältet tar bara hex. En CMYK-kod skickas därför som skärmens ungefärliga färg, och koden själv
          // står i klartext i `productionNote`. En kod som inte går att rita (PMS) står bara där.
          ...(row.ink && { color: row.ink }),
        },
      ],
    },
  }));

  const frameLayers: SupplierLayer[] =
    doc.frame.style === "none" || nameInPrintLayer
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

  // En svartvit logga som printas ligger i trycklagret, i sin färg. En logga i färg är en bild.
  const logoInPrintLayer = print !== null && Boolean(layout.logo?.printed) && !doc.logo?.image;
  const logoLayers: SupplierLayer[] =
    doc.logo && layout.logo && !logoInPrintLayer
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
            // En logga i färg som printas skickas som sin bild. En svartvit som printas hamnar bara här
            // när trycklagret saknas, och då som sin miniatyr. En logga som graveras skickas med sina banor.
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

  // Ett färdigt ämne står med verkstadens egen benämning, så att rätt ämne plockas: ytorna heter
  // annat i deras katalog, och formatet går inte att läsa ur materialkoden.
  const article = blankArticleOf(doc);
  const notes = [
    article ? `Ämne: ${article.name}, ${article.thicknessMm.toLocaleString("sv-SE")} mm.` : null,
    method !== "engrave" ? markingNote(doc, nameInPrintLayer ? layout.rows.map((row) => row.text) : []) : null,
  ].filter((note): note is string => note !== null);

  return {
    productType: "sign",
    material: getMaterial(doc.materialId).supplierCode,
    color: doc.colorId,
    ...supplierOutline(doc),
    dimensions: { widthMm, heightMm, autoSize: false },
    // Fästet ligger inte i skyltmotorns hålmodell — det skickas som namn tills
    // leverantören har en artikelkod per fäste.
    mounting: mountingLabel(doc),
    holes: { type: "none", count: 0, diameterMm: 3.2, placement: "none" },
    layers: [...frameLayers, ...logoLayers, ...textLayers, ...(print ? [print] : [])],
    ...(notes.length > 0 && { productionNote: notes.join(" ") }),
  };
}
