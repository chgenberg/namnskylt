/**
 * SVG-path → polylinjer i mm. Kurvor och bågar delas i korta raka segment —
 * DXF R12 saknar kurvor som alla CAM-program läser likadant.
 */

export interface Pt {
  x: number;
  y: number;
}

export interface Polyline {
  points: Pt[];
  closed: boolean;
}

/** Längsta korda en kurva får delas i. */
const MAX_SEGMENT_MM = 0.25;
const MAX_STEPS = 48;

const TOKEN = /[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;

function stepsFor(lengthMm: number): number {
  return Math.min(MAX_STEPS, Math.max(2, Math.ceil(lengthMm / MAX_SEGMENT_MM)));
}

function dist(a: Pt, b: Pt): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function cubicPoints(p0: Pt, p1: Pt, p2: Pt, p3: Pt): Pt[] {
  const steps = stepsFor(dist(p0, p1) + dist(p1, p2) + dist(p2, p3));
  const out: Pt[] = [];
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    const u = 1 - t;
    out.push({
      x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
      y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
    });
  }
  return out;
}

function quadPoints(p0: Pt, p1: Pt, p2: Pt): Pt[] {
  const steps = stepsFor(dist(p0, p1) + dist(p1, p2));
  const out: Pt[] = [];
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    const u = 1 - t;
    out.push({ x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x, y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y });
  }
  return out;
}

/** Elliptisk båge enligt SVG-specens slutpunktsparametrisering (F.6.5). */
function arcPoints(p0: Pt, rx0: number, ry0: number, rotDeg: number, large: boolean, sweep: boolean, p1: Pt): Pt[] {
  if (dist(p0, p1) < 1e-9) return [];
  let rx = Math.abs(rx0);
  let ry = Math.abs(ry0);
  if (rx === 0 || ry === 0) return [p1];
  const phi = (rotDeg * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (p0.x - p1.x) / 2;
  const dy = (p0.y - p1.y) / 2;
  const x1 = cos * dx + sin * dy;
  const y1 = -sin * dx + cos * dy;
  const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  const coef = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
  const cx1 = (coef * rx * y1) / ry;
  const cy1 = (-coef * ry * x1) / rx;
  const cx = cos * cx1 - sin * cy1 + (p0.x + p1.x) / 2;
  const cy = sin * cx1 + cos * cy1 + (p0.y + p1.y) / 2;
  const angle = (ux: number, uy: number, vx: number, vy: number) =>
    Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const theta1 = angle(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry);
  let delta = angle((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry);
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  if (sweep && delta < 0) delta += 2 * Math.PI;
  const steps = stepsFor(Math.abs(delta) * Math.max(rx, ry));
  const out: Pt[] = [];
  for (let i = 1; i <= steps; i += 1) {
    const t = theta1 + (delta * i) / steps;
    const ex = rx * Math.cos(t);
    const ey = ry * Math.sin(t);
    out.push({ x: cos * ex - sin * ey + cx, y: sin * ex + cos * ey + cy });
  }
  // Sista punkten exakt i slutpunkten, så stängda konturer möts utan glapp.
  out[out.length - 1] = p1;
  return out;
}

export function flattenPath(d: string): Polyline[] {
  const tokens = d.match(TOKEN) ?? [];
  const lines: Polyline[] = [];
  const state: { current: Polyline | null } = { current: null };
  let pos: Pt = { x: 0, y: 0 };
  let start: Pt = { x: 0, y: 0 };
  let lastControl: Pt | null = null;
  let lastCommand = "";
  let i = 0;

  const isCommand = (t: string | undefined) => t !== undefined && /^[A-Za-z]$/.test(t);
  const next = (): number => {
    const t = tokens[i];
    i += 1;
    const value = Number(t);
    if (t === undefined || !Number.isFinite(value)) throw new Error("Ogiltig path");
    return value;
  };
  const add = (points: readonly Pt[]) => {
    let line = state.current;
    if (!line) {
      line = { points: [pos], closed: false };
      state.current = line;
      lines.push(line);
    }
    line.points.push(...points);
    const last = points.at(-1);
    if (last) pos = last;
  };

  let command = "";
  while (i < tokens.length) {
    if (isCommand(tokens[i])) {
      command = tokens[i] ?? "";
      i += 1;
    } else if (command === "M") command = "L";
    else if (command === "m") command = "l";
    const rel = command === command.toLowerCase();
    const at = (x: number, y: number): Pt => (rel ? { x: pos.x + x, y: pos.y + y } : { x, y });
    let control: Pt | null = null;

    switch (command.toUpperCase()) {
      case "M": {
        pos = at(next(), next());
        start = pos;
        state.current = null;
        break;
      }
      case "L":
        add([at(next(), next())]);
        break;
      case "H": {
        const x = next();
        add([{ x: rel ? pos.x + x : x, y: pos.y }]);
        break;
      }
      case "V": {
        const y = next();
        add([{ x: pos.x, y: rel ? pos.y + y : y }]);
        break;
      }
      case "C": {
        const p1 = at(next(), next());
        const p2 = at(next(), next());
        const p3 = at(next(), next());
        add(cubicPoints(pos, p1, p2, p3));
        control = p2;
        break;
      }
      case "S": {
        const p1: Pt = lastControl && /[CcSs]/.test(lastCommand) ? { x: 2 * pos.x - lastControl.x, y: 2 * pos.y - lastControl.y } : pos;
        const p2 = at(next(), next());
        const p3 = at(next(), next());
        add(cubicPoints(pos, p1, p2, p3));
        control = p2;
        break;
      }
      case "Q": {
        const p1 = at(next(), next());
        const p2 = at(next(), next());
        add(quadPoints(pos, p1, p2));
        control = p1;
        break;
      }
      case "T": {
        const p1: Pt = lastControl && /[QqTt]/.test(lastCommand) ? { x: 2 * pos.x - lastControl.x, y: 2 * pos.y - lastControl.y } : pos;
        const p2 = at(next(), next());
        add(quadPoints(pos, p1, p2));
        control = p1;
        break;
      }
      case "A": {
        const rx = next();
        const ry = next();
        const rot = next();
        const large = next() !== 0;
        const sweep = next() !== 0;
        add(arcPoints(pos, rx, ry, rot, large, sweep, at(next(), next())));
        break;
      }
      case "Z": {
        const open = state.current;
        if (open) {
          if (dist(pos, start) > 1e-9) open.points.push(start);
          open.closed = true;
        }
        pos = start;
        state.current = null;
        break;
      }
      default:
        throw new Error(`Okänt path-kommando: ${command}`);
    }
    lastControl = control;
    lastCommand = command;
  }
  return lines.filter((line) => line.points.length >= 2);
}
