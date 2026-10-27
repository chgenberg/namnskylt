"use client";

import { useMemo, useState, type CSSProperties, type MouseEvent } from "react";
import { getColor, getMaterial, getMounting, SHAPES } from "@/engine";
import { Segmented } from "@/components/ui/segmented";
import { useFontEngine } from "@/hooks/use-font-engine";
import {
  CUTTER_OFFSET_MM,
  DEFAULT_SHEET_SETTINGS,
  packSheets,
  PRODUCTION_INK,
  productionBatches,
  renderMachineSvg,
  renderSheetSvg,
  sheetMarks,
  sheetToDxf,
  sheetUtilization,
  usedArea,
  type SheetSettings,
} from "@/lib/production";
import { batchLabel, METHOD_LABEL, productionNumber } from "./batch-label";
import type { AdminOrder } from "@/lib/orders/demo-orders";
import { downloadFile, printSheets, type PrintScale } from "./production-files";
import styles from "@/components/dashboard/dashboard.module.css";

type LineMode = "machine" | "proof";
type ZoomMode = "used" | "sheet";

const ZOOM_OPTIONS = [
  { id: "used", label: "Använd yta" },
  { id: "sheet", label: "Hela skivan" },
] as const;

const LINE_OPTIONS = [
  { id: "machine", label: "Maskin", title: "Hårlinjer 0,03 mm — det som går till maskinen" },
  { id: "proof", label: "Korrektur", title: "Tjocka linjer för granskning på papper" },
] as const;

const PRINT_OPTIONS = [
  { id: "fit", label: "A4", title: "Nedskalad för granskning" },
  { id: "actual", label: "1:1", title: "Arkets verkliga mått" },
] as const;

interface ProductionEditorProps {
  orders: readonly AdminOrder[];
  batchKey: string | null;
  onBatchKey: (key: string) => void;
}

interface NumberFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
}

function NumberField({ label, value, onChange }: NumberFieldProps) {
  return (
    <label className={styles.numberField}>
      <span>{label}</span>
      <span className="field">
        <input
          type="number"
          inputMode="numeric"
          min={1}
          value={value}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (Number.isFinite(next) && next > 0) onChange(next);
          }}
        />
        <span className={styles.unit}>mm</span>
      </span>
    </label>
  );
}

export function ProductionEditor({ orders, batchKey, onBatchKey }: ProductionEditorProps) {
  const fonts = useFontEngine();
  const ready = Boolean(fonts.outline);
  const queue = useMemo(() => orders.filter((o) => o.status !== "shipped"), [orders]);
  const batches = useMemo(() => productionBatches(queue), [queue]);
  const batchIndex = Math.max(0, batches.findIndex((b) => b.key === batchKey));
  const batch = batches[batchIndex];

  const [settings, setSettings] = useState<SheetSettings>(DEFAULT_SHEET_SETTINGS);
  const [lines, setLines] = useState<LineMode>("machine");
  const [zoom, setZoom] = useState<ZoomMode>("used");
  const [labels, setLabels] = useState(true);
  const [printScale, setPrintScale] = useState<PrintScale>("fit");
  const [sheetChoice, setSheetChoice] = useState(0);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const packing = useMemo(() => (batch ? packSheets(batch.units, batch.method, settings) : null), [batch, settings]);
  const productionNo = productionNumber(batchIndex);
  const marks = useMemo(() => {
    if (!packing || !ready) return null;
    return packing.sheets.map((sheet, i) =>
      sheetMarks(sheet, {
        fonts,
        method: packing.method,
        productionNo,
        sheetNo: i + 1,
        sheetCount: packing.sheets.length,
      }),
    );
  }, [packing, fonts, ready, productionNo]);

  const sheetCount = packing?.sheets.length ?? 0;
  const sheetIndex = Math.min(sheetChoice, Math.max(0, sheetCount - 1));
  const sheet = packing?.sheets[sheetIndex];
  const sheetMarkList = marks?.[sheetIndex];
  const proof = lines === "proof";

  const view = useMemo(
    () => (sheet ? (zoom === "used" ? usedArea(sheet) : { xMm: 0, yMm: 0, widthMm: sheet.widthMm, heightMm: sheet.heightMm }) : null),
    [sheet, zoom],
  );
  const svg = useMemo(
    () =>
      sheet && sheetMarkList
        ? renderSheetSvg(sheet, sheetMarkList, { interactive: true, proof, labels, selectedKey, crop: view })
        : null,
    [sheet, sheetMarkList, proof, labels, selectedKey, view],
  );

  if (!batch || !packing) {
    return <p className={styles.muted}>Inga skyltar i produktionskön.</p>;
  }

  const selected = sheet?.placements.find((p) => p.unit.key === selectedKey) ?? null;
  const selectedOrder = selected ? queue.find((o) => o.orderNo === selected.unit.orderNo) : undefined;
  const isMetal = packing.method === "metal-cut";
  const fileBase = `PO-${productionNo}`;

  const pick = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target instanceof Element ? event.target.closest("[data-placement-key]") : null;
    setSelectedKey(target?.getAttribute("data-placement-key") ?? null);
  };

  const update = (patch: Partial<SheetSettings>) => {
    setSettings((current) => ({ ...current, ...patch }));
    setSelectedKey(null);
  };

  const print = () => {
    if (!marks) return;
    printSheets(
      packing.sheets.map((s, i) => ({
        svg: renderSheetSvg(s, marks[i] ?? [], { proof, physicalSize: printScale === "actual" }),
        caption: `${proof ? "Korrektur" : "Gravyrark"} [PO#${productionNo}] · ${batchLabel(batch)} · Skiva ${i + 1}/${sheetCount} · ${s.widthMm} × ${s.heightMm} mm, nedskalad`,
      })),
      { widthMm: packing.settings.sheetWidthMm, heightMm: packing.settings.sheetHeightMm },
      printScale,
      `${fileBase} ${batchLabel(batch)}`,
    );
  };

  const downloadSvg = () => {
    if (!sheet || !sheetMarkList) return;
    downloadFile(renderMachineSvg(sheet, sheetMarkList), `${fileBase}-skiva-${sheetIndex + 1}.svg`, "image/svg+xml");
  };

  const downloadDxf = () => {
    if (!sheet || !sheetMarkList) return;
    downloadFile(sheetToDxf(sheetMarkList, sheet.heightMm), `${fileBase}-skiva-${sheetIndex + 1}.dxf`, "application/dxf");
  };

  return (
    <div className={styles.editor}>
      <aside className={styles.sidebar}>
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>Batch</h2>
          <ul className={styles.batchList}>
            {batches.map((b, i) => (
              <li key={b.key}>
                <button
                  type="button"
                  className={styles.batch}
                  aria-pressed={b.key === batch.key}
                  onClick={() => {
                    onBatchKey(b.key);
                    setSheetChoice(0);
                    setSelectedKey(null);
                  }}
                >
                  <span
                    className={styles.swatch}
                    style={{
                      background: getColor(b.materialId, b.colorId).surface,
                      color: getColor(b.materialId, b.colorId).engraving,
                    }}
                    aria-hidden
                  >
                    A
                  </span>
                  <span className={styles.batchText}>
                    <strong>{batchLabel(b)}</strong>
                    <span className={styles.muted}>
                      PO#{productionNumber(i)} · {b.units.length} st
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>Ark</h2>
          <div className={styles.fieldGrid}>
            <NumberField label="Bredd" value={settings.sheetWidthMm} onChange={(v) => update({ sheetWidthMm: v })} />
            <NumberField label="Höjd" value={settings.sheetHeightMm} onChange={(v) => update({ sheetHeightMm: v })} />
            <NumberField
              label="Kaplängd"
              value={settings.maxStripHeightMm}
              onChange={(v) => update({ maxStripHeightMm: v })}
            />
            <NumberField label="Radavstånd" value={settings.stripGapMm} onChange={(v) => update({ stripGapMm: v })} />
          </div>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={settings.showHeaders}
              onChange={(event) => update({ showHeaders: event.target.checked })}
            />
            Orderrubriker
          </label>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={settings.showSheetHeader}
              onChange={(event) => update({ showSheetHeader: event.target.checked })}
            />
            Skivrubrik
          </label>
        </section>

        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>Visning</h2>
          <Segmented label="Linjer" value={lines} options={LINE_OPTIONS} onChange={setLines} />
          <Segmented label="Zoom" value={zoom} options={ZOOM_OPTIONS} onChange={setZoom} />
          <label className={styles.check}>
            <input type="checkbox" checked={labels} onChange={(event) => setLabels(event.target.checked)} />
            Visa ordernummer på skärmen
          </label>
          <ul className={styles.legend}>
            <li>
              <i style={{ background: PRODUCTION_INK.cut }} aria-hidden /> Skär — raka kanter
            </li>
            <li>
              <i style={{ background: PRODUCTION_INK.throughCut }} aria-hidden /> Genomskär — hörn, ovaler
            </li>
            <li>
              <i style={{ background: PRODUCTION_INK.engrave }} aria-hidden /> Gravyr
            </li>
          </ul>
          {isMetal && (
            <p className={styles.hint}>
              Metall: konturen är verktygsbanan, utbommad {String(CUTTER_OFFSET_MM).replace(".", ",")} mm för Ø3-verktyget.
            </p>
          )}
        </section>

        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>Produktion</h2>
          <div className={styles.printRow}>
            <Segmented label="Utskriftsskala" value={printScale} options={PRINT_OPTIONS} onChange={setPrintScale} />
            <button type="button" className="btn btn--primary" disabled={!marks} onClick={print}>
              Skriv ut
            </button>
          </div>
          <button type="button" className="btn btn--block" disabled={!sheetMarkList} onClick={downloadSvg}>
            Ladda ner SVG · skiva {sheetIndex + 1}
          </button>
          {isMetal && (
            <button type="button" className="btn btn--block" disabled={!sheetMarkList} onClick={downloadDxf}>
              Ladda ner DXF · skiva {sheetIndex + 1}
            </button>
          )}
        </section>
      </aside>

      <section className={styles.stage}>
        <div className={styles.stageBar}>
          <div className={styles.sheetTabs} role="group" aria-label="Skiva">
            {packing.sheets.map((s, i) => (
              <button
                key={s.index}
                type="button"
                className="chip"
                aria-pressed={i === sheetIndex}
                onClick={() => {
                  setSheetChoice(i);
                  setSelectedKey(null);
                }}
              >
                Skiva {i + 1}/{sheetCount}
              </button>
            ))}
          </div>
          {sheet && (
            <span className={`${styles.muted} mono`}>
              {sheet.widthMm} × {sheet.heightMm} mm · {sheet.placements.length} skyltar · {Math.round(sheetUtilization(sheet) * 100)} % · {METHOD_LABEL[packing.method]}
            </span>
          )}
        </div>

        {packing.unplaced.length > 0 && (
          <p className={styles.warning} role="alert">
            {packing.unplaced.length} skyltar fick inte plats: {packing.unplaced[0]?.reason}. Gör arket större.
          </p>
        )}

        <div className={styles.viewer}>
          {svg ? (
            <div
              className={styles.sheet}
              style={view ? ({ "--sheet-ratio": view.widthMm / view.heightMm } as CSSProperties) : undefined}
              onClick={pick}
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          ) : (
            <p className={styles.muted}>{ready ? "Arket är tomt." : "Laddar typsnittens konturer…"}</p>
          )}

          {selected && (
            <div className={styles.inspector}>
              <p className="eyebrow">
                {selected.unit.orderNo} · {selected.unit.copyNo}/{selected.unit.copyCount}
              </p>
              <strong>{selected.unit.doc.rows.map((r) => r.text).filter(Boolean).join(" · ")}</strong>
              <dl className={styles.facts}>
                <dt>Kund</dt>
                <dd>{selectedOrder?.company ?? selectedOrder?.customer ?? "—"}</dd>
                <dt>Mått</dt>
                <dd className="mono">
                  {selected.widthMm} × {selected.heightMm} mm
                </dd>
                <dt>Form</dt>
                <dd>{SHAPES.find((s) => s.id === selected.unit.doc.shape)?.name}</dd>
                <dt>Material</dt>
                <dd>
                  {getMaterial(selected.unit.doc.materialId).name},{" "}
                  {getColor(selected.unit.doc.materialId, selected.unit.doc.colorId).name}
                </dd>
                <dt>Fäste</dt>
                <dd>{getMounting(selected.unit.doc.mounting).name}</dd>
                <dt>Position</dt>
                <dd className="mono">
                  x {selected.xMm} · y {selected.yMm} mm
                </dd>
              </dl>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
