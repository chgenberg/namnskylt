"use client";

import { useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
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
  const [active, setActive] = useState<Target | null>(null);
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

  const handle = (target: Target) => {
    const box = boxOf(layout, target);
    if (!box) return null;
    return (
      <rect
        key={target}
        className={styles.handle}
        data-active={active === target}
        x={box.x - HANDLE_PAD_MM}
        y={box.y - HANDLE_PAD_MM}
        width={box.width + HANDLE_PAD_MM * 2}
        height={box.height + HANDLE_PAD_MM * 2}
        rx={0.8}
        tabIndex={0}
        role="button"
        aria-label={`${TARGET_LABEL[target]} — dra eller använd piltangenterna för att flytta`}
        onPointerDown={startDrag(target)}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onFocus={() => setActive(target)}
        onBlur={() => !dragRef.current && setActive(null)}
        onKeyDown={nudge(target)}
      />
    );
  };

  const { widthMm: w, heightMm: h } = layout;

  return (
    <div className={styles.editor} data-dragging={dragging}>
      <div className={styles.art} aria-hidden="true" dangerouslySetInnerHTML={{ __html: markup }} />
      <svg ref={svgRef} className={styles.overlay} viewBox={previewViewBox(layout, true)} aria-label="Skylten — dra text och logga">
        <path className={styles.safeZone} d={outlinePath(drawn, layout.contentInsetMm)} />
        {guides.centerX && <line className={styles.guide} x1={w / 2} x2={w / 2} y1={0} y2={h} />}
        {guides.centerY && <line className={styles.guide} x1={0} x2={w} y1={h / 2} y2={h / 2} />}
        {handle("logo")}
        {handle("text")}
      </svg>
    </div>
  );
}
