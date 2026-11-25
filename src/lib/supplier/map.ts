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
  engravingPaths,
  cmykHex,
  cmykOf,
  cmykText,
  hexCmyk,
  printColorOf,
  rowPrintColorOf,
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
import type { SupplierLayer, SupplierSignDocument, SupplierSpecRow } from "./types";

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

const PRINT_COLOR_PREFIX = "Tryckfärg ";

/** `#0057B8` blir `#0057B8 (CMYK 100/53/0/28)`: skärmfärgen med tryckfärgerna tryckfilen bär. */
function withCmyk(text: string): string {
  return text.replace(/#[0-9a-f]{6}\b/gi, (hex) => {
    const cmyk = hexCmyk(hex);
    return cmyk ? `${hex} (${cmykText(cmyk)})` : hex;
  });
}

/**
 * Tryckfärgerna för varje fyllnadsfärg i ett trycklager, för verkstadens tryckfil. En färg kunden
 * har angett som CMYK går dit med exakt de värdena; lagret bär den som sin skärmfärg (`cmykHex`),
 * och det är den tabellen slås upp på. Övriga färger räknas om från skärmfärgen.
 */
function printCmykOf(doc: BadgeDocument, markup: string): Record<string, [number, number, number, number]> {
  const typed = new Map<string, [number, number, number, number]>();
  for (const code of [printColorOf(doc), ...doc.rows.map((row) => rowPrintColorOf(doc, row))]) {
    const cmyk = cmykOf(code);
    if (cmyk) typed.set(cmykHex(cmyk).toLowerCase(), [cmyk.c, cmyk.m, cmyk.y, cmyk.k]);
  }
  const table: Record<string, [number, number, number, number]> = {};
  for (const match of markup.matchAll(/fill="(#[0-9a-f]{6})"/g)) {
    const fill = match[1]!;
    const cmyk = hexCmyk(fill);
    const values = typed.get(fill) ?? (cmyk ? ([cmyk.c, cmyk.m, cmyk.y, cmyk.k] as [number, number, number, number]) : null);
    if (values) table[fill] = values;
  }
  return table;
}

/**
 * Raderna verkstaden ritar på sitt orderpapper, en per uppgift: fästet, ämnet och, när något
 * printas, märkningsmetoden, tryckfärgen och texten som printas. Samma uppgifter som i
 * `productionNote`, som ritas som en enda rad, Kommentar, när raderna saknas.
 *
 * Rubrikerna är korta, eftersom orderpapprets kolumn för rubriker är smal.
 */
function specRows(
  doc: BadgeDocument,
  article: ReturnType<typeof blankArticleOf>,
  text: { printed: readonly string[]; engraved: readonly string[]; printInk?: string | null },
): SupplierSpecRow[] {
  const rows: SupplierSpecRow[] = [{ label: "Fäste", value: mountingLabel(doc) }];
  if (article) rows.push({ label: "Ämne", value: `${article.name}, ${article.thicknessMm.toLocaleString("sv-SE")} mm` });
  // Märkningen står alltid, också "Endast gravyr" (besked från Mats på verkstaden via ägaren
  // 2026-11-24: på en plastskylt som bara graveras stod inte om den skulle graveras eller printas).
  rows.push({ label: "Märkning", value: getMarkingMethod(markingOf(doc)).name });
  if (markingOf(doc) !== "engrave") {
    const color = printColorLabel(doc);
    // Varje skärmfärg står med sina tryckfärger, de som tryckfilen bär.
    if (color) rows.push({ label: "Tryckfärg", value: withCmyk(color.startsWith(PRINT_COLOR_PREFIX) ? color.slice(PRINT_COLOR_PREFIX.length) : color) });
    // Utan vald färg trycks det i färgen skylten visades i: den står då här, så att raden alltid finns när något trycks i en färg.
    else if (text.printInk) rows.push({ label: "Tryckfärg", value: withCmyk(text.printInk.toUpperCase()) });
  }
  // Texten som skickas som banor finns inte som text hos verkstaden: då står den, och typsnittet, här.
  if (text.printed.length > 0 || text.engraved.length > 0) rows.push({ label: "Typsnitt", value: getFont(doc.font).name });
  if (text.printed.length > 0) rows.push({ label: "Tryckt text", value: text.printed.join(" / ") });
  if (text.engraved.length > 0) rows.push({ label: "Graverad text", value: text.engraved.join(" / ") });
  return rows;
}

/**
 * En graverad text i ett typsnitt som verkstaden inte har, som färdiga banor i ett bildlager som
 * graveras (besked från Mats på verkstaden via ägaren 2026-11-20: typsnitten behöver inte
 * begränsas, "så länge vi får färdiga filer"). Verkstadens gravyrfil ritar banorna som de är, så
 * bokstäverna blir exakt de kunden såg. Ramen och loggan skickas som förut.
 *
 * `null` när typsnittet är verkstadens eget, när namnet printas (då ligger det i trycklagret) och
 * när konturer saknas eller inte går att räkna om: då skickas texten som text, i verkstadens typsnitt.
 */
function engravedTextLayer(doc: BadgeDocument, layout: BadgeLayout, fonts: FontEngine): SupplierLayer | null {
  if (getFont(doc.font).workshop || layout.namePrinted) return null;
  const paths = fonts.outline ? engravingPaths(layout, fonts)?.filter((path) => path.kind === "text") : null;
  if (!paths || paths.length === 0) return null;
  let markup: string;
  try {
    markup = paths.map((path) => `<path d="${toCubicPath(path.d)}" fill="#000000"/>`).join("");
  } catch {
    return null;
  }
  const { widthMm, heightMm } = doc.size;
  return {
    id: "engraved-text",
    transform: { position: { x: widthMm / 2, y: heightMm / 2 }, rotationDeg: 0 },
    visible: true,
    locked: false,
    data: {
      kind: "image",
      src: "",
      widthMm,
      heightMm,
      renderMode: "engrave",
      lockAspect: true,
      vector: { markup, viewWidth: widthMm, viewHeight: heightMm },
    },
  };
}

/**
 * Allt som printas i en färg, som ett vektorlager i skyltmotorns tryckläge:
 * namnet, ramen och en svartvit logga, var och en i sin färg. Skyltmotorns
 * text- och ramlager har inget läge för print, men ett bildlager i tryckläge
 * hamnar i deras tryckfil och hålls utanför gravyrfilen. Därför skickas det
 * som printas som färdiga banor, i skyltens egna mm.
 *
 * Färgen är den kunden har valt för trycket eller raden, annars färgen
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
  // En graverad text i ett typsnitt verkstaden inte har skickas som banor. Då finns inget textlager.
  const engravedText = engravedTextLayer(doc, layout, fonts);

  const textLayers: SupplierLayer[] = (nameInPrintLayer || engravedText ? [] : layout.rows).map((row) => ({
    id: `text-${row.id}`,
    transform: {
      position: { x: row.xMm, y: row.baselineMm - row.capHeightMm / 2 },
      rotationDeg: 0,
    },
    visible: true,
    locked: false,
    data: {
      kind: "text",
      // Verkstadens motor har bara sina egna typsnitt. En rad i ett annat typsnitt hamnar bara här
      // när dess konturer saknas, och ritas då i verkstadens Arial.
      font: font.workshop ? font.id : "arial",
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
          // Fältet tar bara hex, som är det kunden väljer. En äldre skylt med en CMYK-kod skickas som skärmens
          // ungefärliga färg, med koden i klartext i `productionNote`; en kod som inte går att rita (PMS) står bara där.
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

  // En logga med bild printas som bilden, i färg eller svartvit (sedan 2026-11-25). Bara en äldre svartvit
  // logga utan bild ligger i trycklagret, i tryckets färg.
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
  const rowTexts = layout.rows.map((row) => row.text);
  // Trycklagrets färger i CMYK: tryckfilen bär dem, och raden Tryckfärg visar dem.
  const printMarkup = print?.data.kind === "image" && print.data.vector ? print.data.vector.markup : null;
  const printCmyk = printMarkup ? printCmykOf(doc, printMarkup) : {};
  const text = {
    printed: nameInPrintLayer ? rowTexts : [],
    engraved: engravedText ? rowTexts : [],
    // Färgen skylten visades i, när något trycks i en färg utan att kunden har valt en.
    printInk: printMarkup ? engravingHex(getColor(doc.materialId, doc.colorId)) : null,
  };
  const notes = [
    article ? `Ämne: ${article.name}, ${article.thicknessMm.toLocaleString("sv-SE")} mm.` : null,
    method !== "engrave" ? markingNote(doc, text.printed) : null,
    // Verkstaden har inget textlager att läsa när texten är banor: texten och typsnittet står i klartext.
    text.engraved.length > 0 ? `Typsnitt: ${font.name}. Text som graveras: ${text.engraved.join(" / ")}.` : null,
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
    layers: [...frameLayers, ...logoLayers, ...textLayers, ...(engravedText ? [engravedText] : []), ...(print ? [print] : [])],
    ...(notes.length > 0 && { productionNote: notes.join(" ") }),
    partnerSpecs: specRows(doc, article, text),
    ...(Object.keys(printCmyk).length > 0 && { printColorSpace: "cmyk" as const, printCmyk }),
  };
}
