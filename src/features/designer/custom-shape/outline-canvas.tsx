"use client";

import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import {
  CUSTOM_SHAPE_LIMITS,
  insertOutlinePoint,
  longestEdge,
  moveOutlinePoint,
  nearestOutlineHandle,
  outlineCorner,
  outlineEdgeMidpoint,
  outlineIssueEdges,
  outlinePath,
  outlineToPath,
  removeOutlinePoint,
  splittableEdges,
  type BadgeDocument,
  type CustomOutlineIssue,
  type OutlineHandle,
  type Point,
} from "@/engine";
import { formatMm } from "@/lib/format";
import styles from "./custom-shape.module.css";
import { DimensionField } from "./mm-field";
import { useElementWidth } from "./use-element-width";

/** Så nära ett handtag räknas pekaren som en träff; det närmaste vinner. */
const REACH_PX = 16;
/** Ett finger är grövre än en muspekare. */
const TOUCH_REACH_PX = 24;
/** Kortare kanter än så på skärmen får inget plus — det skulle skymma hörnpunkterna. */
const EDGE_HANDLE_MIN_PX = 36;
/** Måttrutans bredd innan den har mätts, ungefär som i panelen. */
const DEFAULT_SHEET_PX = 240;
/** En kant måste vara så lång för att kunna delas utan att halvorna blir för korta att skära. */
const SPLIT_MIN_MM = CUSTOM_SHAPE_LIMITS.minEdgeMm * 2;
const STEP_MM = 1;
const STEP_LARGE_MM = 5;
const ARROW_STEPS: Record<string, readonly [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};
const NO_POINTS: readonly Point[] = [];

interface Drag {
  pointerId: number;
  index: number;
  /** Konturen som dras — den nyaste, också innan dokumentet hunnit ritas om. */
  points: Point[];
  /** Pekarens avstånd till punkten när den greps, så att punkten inte hoppar till pekaren. */
  grab: Point;
}

interface OutlineCanvasProps {
  /** Skylten med egen form. Formen ritas med motorns kontur, så ytan visar exakt det som skärs. */
  doc: BadgeDocument;
  /** Felet som gör att formen inte går att skära, om något. */
  issue: CustomOutlineIssue | null;
  onChange: (points: Point[]) => void;
  /** Nytt mått, skrivet i måttet vid ritytan. Bara den sida som ändras anges. */
  onResize: (change: { widthMm?: number; heightMm?: number }) => void;
}

function sameHandle(a: OutlineHandle | null, b: OutlineHandle | null): boolean {
  return a?.kind === b?.kind && a?.index === b?.index;
}

/**
 * Ritverktyget för en egen form: hörnpunkterna dras med pekaren eller flyttas
 * med piltangenterna, ett plus mitt på en kant ger en ny punkt och Delete tar
 * bort den valda. Pekaren träffar alltid det närmaste handtaget, så täta
 * punkter går att ta tag i utan att sikta exakt.
 */
export function OutlineCanvas({ doc, issue, onChange, onResize }: OutlineCanvasProps) {
  const points = doc.customOutline ?? NO_POINTS;
  const { widthMm, heightMm } = doc.size;
  const count = points.length;
  const full = count >= CUSTOM_SHAPE_LIMITS.maxPoints;

  const sheetRef = useRef<HTMLDivElement>(null);
  const pointRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const dragRef = useRef<Drag | null>(null);
  /** Punkten som ska ha fokus när den nya konturen har ritats. */
  const focusAfterDraw = useRef<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [hover, setHover] = useState<OutlineHandle | null>(null);
  const [dragging, setDragging] = useState(false);

  const pxPerMm = useElementWidth(sheetRef, DEFAULT_SHEET_PX) / widthMm;
  const active = selected !== null && selected < count ? selected : null;
  /** Kanterna som går att dela, och de av dem som är långa nog på skärmen för ett eget plus. */
  const splittable = useMemo(() => splittableEdges(points, SPLIT_MIN_MM), [points]);
  const edges = useMemo(
    () => splittableEdges(points, Math.max(SPLIT_MIN_MM, EDGE_HANDLE_MIN_PX / pxPerMm)),
    [points, pxPerMm],
  );
  const problemEdges = useMemo(() => outlineIssueEdges(points, issue), [points, issue]);
  const corner = active !== null ? outlineCorner(points, active) : null;
  const shape = outlinePath(doc);

  useEffect(() => {
    const index = focusAfterDraw.current;
    focusAfterDraw.current = null;
    if (index !== null) pointRefs.current[index]?.focus({ preventScroll: true });
  }, [points]);

  const toMm = (clientX: number, clientY: number): { at: Point; pxPerMm: number } | null => {
    const rect = sheetRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return null;
    return {
      at: { x: ((clientX - rect.left) / rect.width) * widthMm, y: ((clientY - rect.top) / rect.height) * heightMm },
      pxPerMm: rect.width / widthMm,
    };
  };

  const handleAt = (event: PointerEvent<HTMLDivElement>): { at: Point; hit: OutlineHandle | null } | null => {
    const pointer = toMm(event.clientX, event.clientY);
    if (!pointer) return null;
    const reachMm = (event.pointerType === "touch" ? TOUCH_REACH_PX : REACH_PX) / pointer.pxPerMm;
    return { at: pointer.at, hit: nearestOutlineHandle(points, pointer.at, reachMm, edges) };
  };

  const press = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const pointer = handleAt(event);
    if (!pointer) return;
    const { at, hit } = pointer;
    if (!hit) {
      setSelected(null);
      return;
    }
    // Ett tryck på ett plus lägger punkten där och fortsätter som en dragning av den nya punkten.
    const next = hit.kind === "edge" ? insertOutlinePoint(points, hit.index) : [...points];
    const index = hit.kind === "edge" ? hit.index + 1 : hit.index;
    const grabbed = next[index];
    if (!grabbed) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, index, points: next, grab: { x: at.x - grabbed.x, y: at.y - grabbed.y } };
    setSelected(index);
    setHover(null);
    setDragging(true);
    if (hit.kind === "edge") {
      focusAfterDraw.current = index;
      onChange(next);
    } else {
      pointRefs.current[index]?.focus({ preventScroll: true });
    }
  };

  const move = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      // Ett finger svävar inte; markeringen under pekaren är bara för mus och penna.
      const next = event.pointerType === "touch" ? null : (handleAt(event)?.hit ?? null);
      if (!sameHandle(next, hover)) setHover(next);
      return;
    }
    const pointer = toMm(event.clientX, event.clientY);
    const before = drag.points[drag.index];
    if (!pointer || !before) return;
    const moved = moveOutlinePoint(drag.points, drag.index, { x: pointer.at.x - drag.grab.x, y: pointer.at.y - drag.grab.y }, doc.size);
    const after = moved[drag.index];
    if (after && after.x === before.x && after.y === before.y) return;
    drag.points = moved;
    onChange(moved);
  };

  const release = (event: PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragging(false);
  };

  const add = (edge: number) => {
    const next = insertOutlinePoint(points, edge);
    if (next.length === count) return;
    setSelected(edge + 1);
    focusAfterDraw.current = edge + 1;
    onChange(next);
  };

  /**
   * Knappen delar den längsta av den valda punktens två kanter. Är ingen punkt
   * vald, eller är båda kanterna för korta att dela, delas formens längsta kant.
   */
  const addNearSelected = () => {
    const near = active !== null ? [active, (active + count - 1) % count].filter((edge) => splittable.includes(edge)) : [];
    const edge = longestEdge(points, near.length > 0 ? near : splittable);
    if (edge !== null) add(edge);
  };

  const remove = (index: number, refocus: boolean) => {
    const next = removeOutlinePoint(points, index);
    if (next.length === count) return;
    const stay = Math.min(index, next.length - 1);
    setSelected(stay);
    // Togs sista punkten bort försvinner knappen som hade fokus; flytta fokus till den som tar dess plats.
    if (refocus) focusAfterDraw.current = stay;
    onChange(next);
  };

  const keyOnPoint = (index: number) => (event: KeyboardEvent<HTMLButtonElement>) => {
    const point = points[index];
    const direction = ARROW_STEPS[event.key];
    if (direction && point) {
      event.preventDefault();
      const step = event.shiftKey ? STEP_LARGE_MM : STEP_MM;
      onChange(moveOutlinePoint(points, index, { x: point.x + direction[0] * step, y: point.y + direction[1] * step }, doc.size));
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      remove(index, true);
    }
  };

  const edgeLine = (edge: number, className: string | undefined, key: string) => {
    const a = points[edge];
    const b = points[(edge + 1) % count];
    return a && b ? <line key={key} className={className} x1={a.x} y1={a.y} x2={b.x} y2={b.y} /> : null;
  };

  return (
    <div className={styles.canvas}>
      <div
        className={`${styles.stage} dot-grid`}
        role="group"
        aria-label="Ritverktyg för egen form"
        data-dragging={dragging || undefined}
        data-hover={hover?.kind}
        onPointerDown={press}
        onPointerMove={move}
        onPointerUp={release}
        onPointerCancel={release}
        onPointerLeave={() => setHover(null)}
        // Ett tryck i ytan ska inte flytta fokus från punkten eller markera text.
        onMouseDown={(event) => event.preventDefault()}
      >
        <div ref={sheetRef} className={styles.sheet} style={{ "--ratio": widthMm / heightMm } as CSSProperties}>
          <DimensionField
            side="top"
            label="Bredd"
            value={widthMm}
            min={CUSTOM_SHAPE_LIMITS.minSideMm}
            max={CUSTOM_SHAPE_LIMITS.maxSideMm}
            onCommit={(next) => onResize({ widthMm: next })}
          />
          <DimensionField
            side="left"
            label="Höjd"
            value={heightMm}
            min={CUSTOM_SHAPE_LIMITS.minSideMm}
            max={CUSTOM_SHAPE_LIMITS.maxSideMm}
            onCommit={(next) => onResize({ heightMm: next })}
          />
          <svg className={styles.art} viewBox={`0 0 ${widthMm} ${heightMm}`} aria-hidden="true">
            <rect className={styles.box} width={widthMm} height={heightMm} />
            <path className={styles.fill} d={shape} />
            <path className={styles.skeleton} d={outlineToPath({ kind: "polygon", points: [...points] })} />
            <path className={styles.shape} d={shape} data-invalid={issue !== null || undefined} />
            {active !== null && edgeLine((active + count - 1) % count, styles.edgeBefore, "before")}
            {active !== null && edgeLine(active, styles.edgeAfter, "after")}
            {problemEdges.map((edge) => edgeLine(edge, styles.edgeProblem, `problem-${edge}`))}
          </svg>
          {points.map((point, i) => {
            const mid = edges.includes(i) ? outlineEdgeMidpoint(points, i) : null;
            return (
              <Fragment key={i}>
                <button
                  ref={(element) => {
                    pointRefs.current[i] = element;
                  }}
                  type="button"
                  className={styles.point}
                  aria-pressed={active === i}
                  aria-label={`Punkt ${i + 1} av ${count}: ${formatMm(point.x)} mm från vänster, ${formatMm(point.y)} mm uppifrån`}
                  data-hover={(hover?.kind === "point" && hover.index === i) || undefined}
                  style={{ "--x": point.x / widthMm, "--y": point.y / heightMm } as CSSProperties}
                  onFocus={() => setSelected(i)}
                  onKeyDown={keyOnPoint(i)}
                />
                {mid && (
                  <button
                    type="button"
                    className={styles.edgeHandle}
                    // Nås med pekaren; tangentbordet lägger till en punkt med knappen under ytan.
                    tabIndex={-1}
                    aria-label={`Lägg till en punkt mellan punkt ${i + 1} och ${((i + 1) % count) + 1}`}
                    data-hover={(hover?.kind === "edge" && hover.index === i) || undefined}
                    style={{ "--x": mid.x / widthMm, "--y": mid.y / heightMm } as CSSProperties}
                    onClick={() => add(i)}
                  />
                )}
              </Fragment>
            );
          })}
        </div>
      </div>

      <div className={styles.readout} aria-live="polite">
        {corner && active !== null ? (
          <>
            <span className={styles.readoutTitle}>Punkt {active + 1}</span>
            <span className={styles.metric}>
              <svg className={styles.edgeBefore} viewBox="0 0 18 6" width="18" height="6" aria-hidden="true">
                <line x1="1" y1="3" x2="17" y2="3" />
              </svg>
              <span className="visually-hidden">Kanten från föregående punkt:</span>
              <span className="mono">{formatMm(corner.prevEdgeMm)} mm</span>
            </span>
            <span className={styles.metric}>
              <svg className={styles.edgeAfter} viewBox="0 0 18 6" width="18" height="6" aria-hidden="true">
                <line x1="1" y1="3" x2="17" y2="3" />
              </svg>
              <span className="visually-hidden">Kanten till nästa punkt:</span>
              <span className="mono">{formatMm(corner.nextEdgeMm)} mm</span>
            </span>
            <span className={styles.metric}>
              <svg className={styles.angleIcon} viewBox="0 0 14 12" width="14" height="12" aria-hidden="true">
                <path d="M13 11H1L9 1" />
                <path d="M7 11a5 5 0 0 0-1.6-3.6" />
              </svg>
              <span className="visually-hidden">Vinkeln mellan kanterna:</span>
              <span className="mono">{Math.round(corner.angleDeg)}°</span>
            </span>
          </>
        ) : (
          <span className={styles.note}>Välj en punkt för att se kanternas längd och vinkeln mellan dem.</span>
        )}
      </div>

      <div className={styles.tools}>
        <button type="button" className={`btn ${styles.tool}`} disabled={splittable.length === 0} onClick={addNearSelected}>
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path d="M8 3v10M3 8h10" />
          </svg>
          Lägg till punkt
        </button>
        <button
          type="button"
          className={`btn ${styles.tool}`}
          disabled={active === null || count <= CUSTOM_SHAPE_LIMITS.minPoints}
          onClick={() => active !== null && remove(active, false)}
        >
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
          Ta bort punkt
        </button>
        <span className={`mono ${styles.count}`} data-full={full || undefined}>
          {count}/{CUSTOM_SHAPE_LIMITS.maxPoints} punkter
        </span>
      </div>

      <p className={styles.note}>
        Dra i en punkt för att flytta den, och tryck på ett plus för en ny punkt på kanten. Piltangenterna flyttar den valda punkten{" "}
        {STEP_MM} mm, med Shift {STEP_LARGE_MM} mm, och Delete tar bort den.
        {full && ` Formen har högsta antalet punkter, ${CUSTOM_SHAPE_LIMITS.maxPoints}. Ta bort en för att kunna lägga till en ny.`}
      </p>
    </div>
  );
}
