/**
 * SVG-path → samma bana med bara absoluta `M`, `L`, `C` och `Z`. Verkstadens
 * vektorlager tar inga andra kommandon (deras `sanitizeVectorMarkup`), medan
 * våra banor har mer: bokstäverna är kvadratiska kurvor (`Q`), och ramar och
 * konturer skrivs med relativa `h`, `v` och bågar (`a`).
 *
 * Kvadratiska kurvor blir kubiska exakt. Bågar delas i kvartsvarv, där en
 * kubisk kurva avviker mindre än 0,03 % från cirkeln.
 */

interface Pt {
  x: number;
  y: number;
}

/** Varje bokstav är ett kommando, så att ett okänt kommando stoppar omräkningen i stället för att läsas som tal. */
const TOKEN = /[A-Za-z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;
const DECIMALS = 3;

/** Tre decimaler i mm räcker för tryck och håller banan kort. `-0` skrivs som `0`. */
function num(value: number): string {
  const rounded = Number(value.toFixed(DECIMALS));
  return String(rounded === 0 ? 0 : rounded);
}

function cubic(p1: Pt, p2: Pt, p3: Pt): string {
  return `C${num(p1.x)} ${num(p1.y)} ${num(p2.x)} ${num(p2.y)} ${num(p3.x)} ${num(p3.y)}`;
}

/** En elliptisk båge som kubiska kurvor, enligt SVG-specens slutpunktsparametrisering (F.6.5). */
function arcCubics(p0: Pt, rx0: number, ry0: number, rotDeg: number, large: boolean, sweep: boolean, p1: Pt): string {
  if (Math.hypot(p1.x - p0.x, p1.y - p0.y) < 1e-9) return "";
  let rx = Math.abs(rx0);
  let ry = Math.abs(ry0);
  if (rx === 0 || ry === 0) return `L${num(p1.x)} ${num(p1.y)}`;
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
  const numerator = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const denominator = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  const coef = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, numerator / denominator));
  const cx1 = (coef * rx * y1) / ry;
  const cy1 = (-coef * ry * x1) / rx;
  const cx = cos * cx1 - sin * cy1 + (p0.x + p1.x) / 2;
  const cy = sin * cx1 + cos * cy1 + (p0.y + p1.y) / 2;
  const angle = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const theta1 = angle(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry);
  let delta = angle((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry);
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  if (sweep && delta < 0) delta += 2 * Math.PI;

  // Punkten och riktningen på ellipsen vid vinkeln t.
  const at = (t: number): Pt => ({
    x: cos * rx * Math.cos(t) - sin * ry * Math.sin(t) + cx,
    y: sin * rx * Math.cos(t) + cos * ry * Math.sin(t) + cy,
  });
  const tangent = (t: number): Pt => ({
    x: -cos * rx * Math.sin(t) - sin * ry * Math.cos(t),
    y: -sin * rx * Math.sin(t) + cos * ry * Math.cos(t),
  });

  const pieces = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 2) - 1e-9));
  const step = delta / pieces;
  const handle = (4 / 3) * Math.tan(step / 4);
  let out = "";
  for (let i = 0; i < pieces; i += 1) {
    const t0 = theta1 + step * i;
    const t1 = t0 + step;
    const from = at(t0);
    // Sista punkten exakt i slutpunkten, så stängda konturer möts utan glapp.
    const to = i === pieces - 1 ? p1 : at(t1);
    const d0 = tangent(t0);
    const d1 = tangent(t1);
    out += cubic(
      { x: from.x + handle * d0.x, y: from.y + handle * d0.y },
      { x: to.x - handle * d1.x, y: to.y - handle * d1.y },
      to,
    );
  }
  return out;
}

/**
 * Banan med bara absoluta `M`, `L`, `C` och `Z`. Kastar för en trasig bana och
 * för kommandon motorn inte skriver (`S`, `T`): anroparen väljer då en annan väg.
 */
export function toCubicPath(d: string): string {
  const tokens = d.match(TOKEN) ?? [];
  let out = "";
  let pos: Pt = { x: 0, y: 0 };
  let start: Pt = { x: 0, y: 0 };
  let i = 0;
  let command = "";

  const isCommand = (token: string | undefined) => token !== undefined && /^[A-Za-z]$/.test(token);
  const next = (): number => {
    const value = Number(tokens[i]);
    i += 1;
    if (!Number.isFinite(value)) throw new Error("Ogiltig path");
    return value;
  };

  while (i < tokens.length) {
    if (isCommand(tokens[i])) {
      command = tokens[i] ?? "";
      i += 1;
    } else if (command === "M") command = "L";
    else if (command === "m") command = "l";
    // Tal utan kommando före sig, eller tal efter Z: banan är trasig. Z tar inga tal, så utan
    // det här stoppet skulle samma tal läsas om och om igen.
    else if (command === "" || command.toUpperCase() === "Z") throw new Error("Ogiltig path");
    const relative = command === command.toLowerCase();
    const at = (x: number, y: number): Pt => (relative ? { x: pos.x + x, y: pos.y + y } : { x, y });

    switch (command.toUpperCase()) {
      case "M":
        pos = at(next(), next());
        start = pos;
        out += `M${num(pos.x)} ${num(pos.y)}`;
        break;
      case "L":
        pos = at(next(), next());
        out += `L${num(pos.x)} ${num(pos.y)}`;
        break;
      case "H": {
        const x = next();
        pos = { x: relative ? pos.x + x : x, y: pos.y };
        out += `L${num(pos.x)} ${num(pos.y)}`;
        break;
      }
      case "V": {
        const y = next();
        pos = { x: pos.x, y: relative ? pos.y + y : y };
        out += `L${num(pos.x)} ${num(pos.y)}`;
        break;
      }
      case "C": {
        const p1 = at(next(), next());
        const p2 = at(next(), next());
        const p3 = at(next(), next());
        out += cubic(p1, p2, p3);
        pos = p3;
        break;
      }
      case "Q": {
        // Samma kurva som kubisk: styrpunkterna ligger två tredjedelar ut mot den kvadratiska.
        const control = at(next(), next());
        const end = at(next(), next());
        out += cubic(
          { x: pos.x + (2 / 3) * (control.x - pos.x), y: pos.y + (2 / 3) * (control.y - pos.y) },
          { x: end.x + (2 / 3) * (control.x - end.x), y: end.y + (2 / 3) * (control.y - end.y) },
          end,
        );
        pos = end;
        break;
      }
      case "A": {
        const rx = next();
        const ry = next();
        const rotation = next();
        const large = next() !== 0;
        const sweep = next() !== 0;
        const end = at(next(), next());
        out += arcCubics(pos, rx, ry, rotation, large, sweep, end);
        pos = end;
        break;
      }
      case "Z":
        out += "Z";
        pos = start;
        break;
      default:
        throw new Error(`Okänt path-kommando: ${command}`);
    }
  }
  return out;
}
