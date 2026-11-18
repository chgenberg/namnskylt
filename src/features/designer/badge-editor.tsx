"use client";

import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { withPlaceholders } from "@/components/badge-preview";
import {
  layoutBadge,
  moveRect,
  outlinePath,
  previewViewBox,
  renderBadgeSvg,
  snapToCenter,
  type BadgeDocument,
  type BadgeLayout,
  type FontEngine,
  type Offset,
  type Rect,
} from "@/engine";
import type { DesignerAction } from "./state";
import styles from "./badge-editor.module.css";

type Target = "text" | "logo";

interface BadgeEditorProps {
  doc: BadgeDocument;
  fonts: FontEngine;
  dispatch: (action: DesignerAction) => void;
}

interface Drag {
  target: Target;
  pointerId: number;
  start: DOMPoint;
  origin: Offset;
  autoBox: Rect;
}

type Corner = "nw" | "ne" | "se" | "sw";
const CORNERS: readonly Corner[] = ["nw", "ne", "se", "sw"];

/** Storleken ändras: loggan eller hela texten dras större eller mindre i ett hörn. */
interface Resize {
  target: Target;
  pointerId: number;
  /** Rutans mitt när dragningen började. Storleken följer pekarens avstånd dit. */
  centre: { x: number; y: number };
  startDistance: number;
  /** Loggans höjd och radernas versalhöjd som de ritades när dragningen började. */
  logoHeightMm: number;
  caps: readonly { id: string; capHeightMm: number }[];
}

/** Hörnhandtagets synliga sida och greppyta, i skärmpixlar: lika stora hur stor skylten än ritas. */
const GRIP_PX = 9;
const GRIP_HIT_PX = 14;
/** Inom så många skärmpixlar drar mittlinjen åt sig rutan. */
const SNAP_PX = 8;
/** Greppytan är lite större än versalerna, så tunna rader går att ta tag i. */
const HANDLE_PAD_MM = 1;
const NUDGE_MM = 0.5;
const NUDGE_LARGE_MM = 2;
const TARGET_LABEL: Record<Target, string> = { text: "Texten", logo: "Loggan" };

function offsetOf(layout: BadgeLayout, target: Target): Offset {
  return target === "text" ? layout.textOffsetMm : layout.logoOffsetMm;
}

function boxOf(layout: BadgeLayout, target: Target): Rect | null {
  return target === "text" ? layout.textBox : layout.logo;
}

/** Rutan där den stod innan kunden flyttade den — mittlinjerna mäts därifrån. */
function autoBoxOf(layout: BadgeLayout, target: Target): Rect | null {
  const box = boxOf(layout, target);
  if (!box) return null;
  const { xMm, yMm } = offsetOf(layout, target);
  return moveRect(box, { xMm: -xMm, yMm: -yMm });
}

/**
 * Ritningen som editor: texten och loggan dras direkt på skylten. Layouten
 * håller dem innanför säkerhetszonen (den streckade linjen), så det som
 * syns här är det som graveras.
 */
export function BadgeEditor({ doc, fonts, dispatch }: BadgeEditorProps) {
  const idPrefix = useId().replace(/:/g, "");
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const resizeRef = useRef<Resize | null>(null);
  const moverRef = useRef<Partial<Record<Target, SVGRectElement | null>>>({});
  const [pxPerMm, setPxPerMm] = useState(10);
  const [active, setActive] = useState<Target | null>(null);
  /** Rutan muspekaren är över. Handtagen visas för den valda rutan, annars för den här. */
  const [hovered, setHovered] = useState<Target | null>(null);
  const [dragging, setDragging] = useState(false);
  const [guides, setGuides] = useState({ centerX: false, centerY: false });

  const { drawn, layout, markup } = useMemo(() => {
    const { doc: drawnDoc, ids } = withPlaceholders(doc);
    const drawnLayout = layoutBadge(drawnDoc, fonts);
    return {
      drawn: drawnDoc,
      layout: drawnLayout,
      markup: renderBadgeSvg(drawnDoc, drawnLayout, {
        mode: "preview",
        fonts,
        showDimensions: true,
        placeholderRowIds: ids,
        idPrefix,
      }),
    };
  }, [doc, fonts, idPrefix]);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  const toMm = (clientX: number, clientY: number): DOMPoint | null => {
    const matrix = svgRef.current?.getScreenCTM();
    return matrix ? new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse()) : null;
  };

  const startDrag = (target: Target) => (event: PointerEvent<SVGRectElement>) => {
    const start = toMm(event.clientX, event.clientY);
    const autoBox = autoBoxOf(layout, target);
    if (!start || !autoBox) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { target, pointerId: event.pointerId, start, origin: offsetOf(layout, target), autoBox };
    setActive(target);
    setDragging(true);
  };

  const moveDrag = (event: PointerEvent<SVGRectElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const point = toMm(event.clientX, event.clientY);
    const pxPerMm = svgRef.current?.getScreenCTM()?.a ?? 1;
    if (!point) return;
    const desired = { xMm: drag.origin.xMm + point.x - drag.start.x, yMm: drag.origin.yMm + point.y - drag.start.y };
    const snapped = snapToCenter(drawn, drag.autoBox, desired, SNAP_PX / pxPerMm);
    setGuides({ centerX: snapped.centerX, centerY: snapped.centerY });
    dispatch({ type: "move", target: drag.target, offset: snapped.offset });
  };

  const endDrag = (event: PointerEvent<SVGRectElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    setGuides({ centerX: false, centerY: false });
    // Spara det layouten faktiskt ritade, inte var pekaren släpptes utanför zonen.
    dispatch({ type: "move", target: drag.target, offset: offsetOf(layoutRef.current, drag.target) });
  };

  /**
   * Hörnhandtagen (besked via ägaren 2026-11-18): loggan och texten dras större eller mindre.
   * Storleken följer pekarens avstånd till rutans mitt, så alla fyra hörn fungerar likadant.
   * Layouten håller allt inom säkerhetszonen, så det som inte ryms växer inte vidare.
   */
  const startResize = (target: Target) => (event: PointerEvent<SVGCircleElement>) => {
    const start = toMm(event.clientX, event.clientY);
    const box = boxOf(layout, target);
    if (!start || !box) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    resizeRef.current = {
      target,
      pointerId: event.pointerId,
      centre,
      startDistance: Math.max(0.5, Math.hypot(start.x - centre.x, start.y - centre.y)),
      logoHeightMm: layout.logo?.height ?? 0,
      caps: layout.rows.map((row) => ({ id: row.id, capHeightMm: row.capHeightMm })),
    };
    setActive(target);
    setDragging(true);
  };

  const moveResize = (event: PointerEvent<SVGCircleElement>) => {
    const resize = resizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    const point = toMm(event.clientX, event.clientY);
    if (!point) return;
    const factor = Math.hypot(point.x - resize.centre.x, point.y - resize.centre.y) / resize.startDistance;
    if (resize.target === "logo") dispatch({ type: "logo/height", heightMm: resize.logoHeightMm * factor });
    else dispatch({ type: "rows/caps", caps: resize.caps.map((cap) => ({ id: cap.id, capHeightMm: cap.capHeightMm * factor })) });
  };

  const endResize = (event: PointerEvent<SVGCircleElement>) => {
    const resize = resizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    resizeRef.current = null;
    setDragging(false);
    // Spara storleken layouten faktiskt ritade, inte den pekaren bad om utanför det som ryms.
    const drawnLayout = layoutRef.current;
    if (resize.target === "logo" && drawnLayout.logo) dispatch({ type: "logo/height", heightMm: drawnLayout.logo.height });
    if (resize.target === "text") {
      dispatch({ type: "rows/caps", caps: drawnLayout.rows.map((row) => ({ id: row.id, capHeightMm: row.capHeightMm })) });
    }
    // Rutan får fokus, så att handtagen försvinner när kunden klickar någon annanstans.
    moverRef.current[resize.target]?.focus({ preventScroll: true });
  };

  const nudge = (target: Target) => (event: KeyboardEvent<SVGRectElement>) => {
    const step = event.shiftKey ? NUDGE_LARGE_MM : NUDGE_MM;
    const delta: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const move = delta[event.key];
    if (!move) return;
    event.preventDefault();
    const current = offsetOf(layout, target);
    dispatch({ type: "move", target, offset: { xMm: current.xMm + move[0], yMm: current.yMm + move[1] } });
  };

  /** Rutans kanter med greppytans luft omkring. */
  const edgesOf = (box: Rect) => ({
    left: box.x - HANDLE_PAD_MM,
    top: box.y - HANDLE_PAD_MM,
    right: box.x + box.width + HANDLE_PAD_MM,
    bottom: box.y + box.height + HANDLE_PAD_MM,
  });

  /** Pekaren lämnar en del av rutan. Går den till en annan del av samma ruta står handtagen kvar. */
  const leave = (target: Target) => (event: PointerEvent<SVGElement>) => {
    const to = event.relatedTarget;
    if (to instanceof Element && to.getAttribute("data-part") === target) return;
    setHovered((current) => (current === target ? null : current));
  };

  const handle = (target: Target) => {
    const box = boxOf(layout, target);
    if (!box) return null;
    const { left, top, right, bottom } = edgesOf(box);
    return (
      <rect
        key={target}
        ref={(element) => {
          moverRef.current[target] = element;
        }}
        className={styles.handle}
        data-active={active === target}
        data-part={target}
        x={left}
        y={top}
        width={right - left}
        height={bottom - top}
        rx={0.8}
        tabIndex={0}
        role="button"
        aria-label={`${TARGET_LABEL[target]} — dra eller använd piltangenterna för att flytta. Dra i ett hörn för att ändra storlek.`}
        onPointerDown={startDrag(target)}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerEnter={(event) => event.pointerType === "mouse" && setHovered(target)}
        onPointerLeave={leave(target)}
        onFocus={() => setActive(target)}
        onBlur={() => !dragRef.current && !resizeRef.current && setActive(null)}
        onKeyDown={nudge(target)}
      />
    );
  };

  /**
   * Hörnhandtagen för en ruta. De ligger i ett eget lager överst, bara för den ruta som är vald
   * eller som pekaren är över: står loggan ovanför texten möts deras hörn, och ett osynligt
   * handtag på den andra rutan skulle annars ta greppet.
   */
  const grips = (target: Target | null) => {
    const box = target && boxOf(layout, target);
    if (!target || !box) return null;
    const { left, top, right, bottom } = edgesOf(box);
    const side = GRIP_PX / pxPerMm;
    return CORNERS.map((corner) => {
      const x = corner.endsWith("w") ? left : right;
      const y = corner.startsWith("n") ? top : bottom;
      return (
        <g key={`${target}-${corner}`} className={styles.grip} data-corner={corner} data-for={target} aria-hidden="true">
          <rect className={styles.gripMark} x={x - side / 2} y={y - side / 2} width={side} height={side} rx={side / 5} />
          <circle
            className={styles.gripHit}
            data-part={target}
            cx={x}
            cy={y}
            r={GRIP_HIT_PX / pxPerMm}
            // Fokus stannar på rutan, så att handtagen inte försvinner under dragningen.
            onMouseDown={(event) => event.preventDefault()}
            onPointerDown={startResize(target)}
            onPointerMove={moveResize}
            onPointerUp={endResize}
            onPointerCancel={endResize}
            onPointerLeave={leave(target)}
          />
        </g>
      );
    });
  };

  const { widthMm: w, heightMm: h } = layout;
  const viewBox = previewViewBox(layout, true);
  const [, , viewWidth = 1, viewHeight = 1] = viewBox.split(" ").map(Number);

  // Handtagen ska vara lika stora på skärmen hur stor skylten än ritas: mät skalan när ytan eller skylten ändras.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const measure = () => {
      const scale = svg.getScreenCTM()?.a;
      if (scale && Number.isFinite(scale) && scale > 0) setPxPerMm(scale);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(svg);
    return () => observer.disconnect();
  }, [viewBox]);

  return (
    // Proportionerna låter scenen hålla ritningen inom sin höjd — en egen form kan vara lika hög som bred.
    <div className={styles.editor} data-dragging={dragging} style={{ "--drawing-ratio": viewWidth / viewHeight } as CSSProperties}>
      <div className={styles.art} aria-hidden="true" dangerouslySetInnerHTML={{ __html: markup }} />
      <svg ref={svgRef} className={styles.overlay} viewBox={viewBox} aria-label="Skylten — dra text och logga, eller dra i ett hörn för att ändra storlek">
        <path className={styles.safeZone} d={outlinePath(drawn, layout.contentInsetMm)} />
        {guides.centerX && <line className={styles.guide} x1={w / 2} x2={w / 2} y1={0} y2={h} />}
        {guides.centerY && <line className={styles.guide} x1={0} x2={w} y1={h / 2} y2={h / 2} />}
        {handle("logo")}
        {handle("text")}
        {grips(active ?? hovered)}
      </svg>
    </div>
  );
}
