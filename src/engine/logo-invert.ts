/**
 * Inverterad logga som är en form med innehåll: en ikon, en platta, en cirkel eller en sköld med
 * text eller symbol i. Besked av ägaren 2026-11-25, som inverterade en vit rundad ruta med "m." i
 * och fick rutans fyra hörn graverade: "ska bli en outline sen m. i mitten".
 *
 * Förut vändes en svartvit logga över hela bildens ruta, så att det genomskinliga runt formen blev
 * gravyr: hörnen utanför en rundad ruta, och en rektangel runt en cirkel. Nu vänds bläck och urtag
 * inom formen, och formens kant blir en kontur, så att formen syns också inverterad. Innehållet
 * graveras, och det som var gravyr runt det blir skyltens yta.
 *
 * En logga som inte är en sådan form (ett ord med lösa bokstäver, eller en symbol bredvid ett ord)
 * vänds som förut. Regeln är vanlig bildbehandling, ingen AI.
 */

/** Konturens bredd, som andel av formens kortaste sida: på en logga som är 20 mm hög blir den 1 mm. */
const OUTLINE_SHARE = 0.05;
/** Så stor del av allt som syns ska formen vara. Resten är brus, eller ett ® vid sidan av. */
const MAIN_SHARE = 0.9;
/**
 * Så stor del av sin ruta ska formen fylla, med hålen ifyllda. En rundad ruta fyller nästan allt,
 * en cirkel 79 % och en sköld runt 70 %. Ett ord i skrivstil som hänger ihop fyller långt mindre,
 * och vänds som förut, till en platta med ordet urtaget.
 */
const MIN_FILL = 0.5;

export interface LogoOutline {
  /** Formen med alla hål ifyllda (1 = inom formen). */
  shape: Uint8Array;
  /** Konturen längs formens kant (1 = gravyr). */
  ring: Uint8Array;
  /**
   * Konturens innerkant som mjuk mask, 0–1 där över 0,5 är kontur (`TraceOptions.soft`): avståndet
   * till formens kant, så att innerkanten blir lika jämn som ytterkanten.
   */
  soft: Float32Array;
}

/** Formen med sina hål ifyllda: allt som inte nås från bildens kant utan att korsa masken. */
export function filledShape(mask: ArrayLike<number>, width: number, height: number): Uint8Array {
  const count = width * height;
  const outside = new Uint8Array(count);
  const stack: number[] = [];
  const reach = (i: number) => {
    if (outside[i] || mask[i]) return;
    outside[i] = 1;
    stack.push(i);
  };
  for (let x = 0; x < width; x++) {
    reach(x);
    reach((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    reach(y * width);
    reach(y * width + width - 1);
  }
  // Bottnen sprider sig bara rakt, inte snett: två bläckpixlar som möts i ett hörn stänger ett hål.
  while (stack.length > 0) {
    const i = stack.pop() ?? 0;
    const x = i % width;
    if (x > 0) reach(i - 1);
    if (x < width - 1) reach(i + 1);
    if (i >= width) reach(i - width);
    if (i < count - width) reach(i + width);
  }
  const shape = new Uint8Array(count);
  for (let i = 0; i < count; i++) shape[i] = outside[i] ? 0 : 1;
  return shape;
}

/** Den största sammanhängande delen av masken: antal pixlar och ruta. */
function largestPart(mask: Uint8Array, width: number, height: number): { area: number; total: number; width: number; height: number } {
  const seen = new Uint8Array(mask.length);
  let best = { area: 0, width: 0, height: 0 };
  let total = 0;
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    let area = 0;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    const stack = [start];
    seen[start] = 1;
    while (stack.length > 0) {
      const i = stack.pop() ?? 0;
      area++;
      const x = i % width;
      const y = (i - x) / width;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      for (let ny = Math.max(0, y - 1); ny <= Math.min(height - 1, y + 1); ny++) {
        for (let nx = Math.max(0, x - 1); nx <= Math.min(width - 1, x + 1); nx++) {
          const n = ny * width + nx;
          if (mask[n] && !seen[n]) {
            seen[n] = 1;
            stack.push(n);
          }
        }
      }
    }
    total += area;
    if (area > best.area) best = { area, width: maxX - minX + 1, height: maxY - minY + 1 };
  }
  return { ...best, total };
}

/** Avståndet i kvadrat längs en rad (Felzenszwalb och Huttenlocher): `f` är varje plats eget värde. */
function squaredDistance1d(f: Float64Array, n: number, out: Float64Array, v: Int32Array, z: Float64Array): void {
  let k = 0;
  v[0] = 0;
  z[0] = -Infinity;
  z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    const at = (p: number) => ((f[q] ?? 0) + q * q - ((f[p] ?? 0) + p * p)) / (2 * q - 2 * p);
    let s = at(v[k] ?? 0);
    while (s <= (z[k] ?? 0)) {
      k--;
      s = at(v[k] ?? 0);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while ((z[k + 1] ?? Infinity) < q) k++;
    const p = v[k] ?? 0;
    out[q] = (q - p) * (q - p) + (f[p] ?? 0);
  }
}

/** Avståndet (px) från varje pixels mitt till närmaste pixel utanför formen. Utanför bilden räknas som utanför. */
function distanceToOutside(shape: Uint8Array, width: number, height: number): Float64Array {
  // En ram av utanför runt bilden, så att en form som når bildens kant får sin kontur där också.
  const w = width + 2;
  const h = height + 2;
  const FAR = 1e20;
  const grid = new Float64Array(w * h);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) if (shape[y * width + x]) grid[(y + 1) * w + x + 1] = FAR;
  }
  const n = Math.max(w, h);
  const f = new Float64Array(n);
  const out = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = grid[y * w + x] ?? 0;
    squaredDistance1d(f, h, out, v, z);
    for (let y = 0; y < h; y++) grid[y * w + x] = out[y] ?? 0;
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = grid[y * w + x] ?? 0;
    squaredDistance1d(f, w, out, v, z);
    for (let x = 0; x < w; x++) grid[y * w + x] = out[x] ?? 0;
  }
  const distance = new Float64Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) distance[y * width + x] = Math.sqrt(grid[(y + 1) * w + x + 1] ?? 0);
  }
  return distance;
}

/**
 * Konturen till en logga som är en form med innehåll, eller `null` när loggan inte är en sådan form
 * och vänds som förut. `mask` är det som syns av loggan (1 = logga).
 */
export function logoOutline(mask: ArrayLike<number>, width: number, height: number): LogoOutline | null {
  const shape = filledShape(mask, width, height);
  const main = largestPart(shape, width, height);
  if (main.area === 0 || main.area < main.total * MAIN_SHARE || main.area < main.width * main.height * MIN_FILL) return null;
  const reach = Math.max(1, OUTLINE_SHARE * Math.min(main.width, main.height));
  const distance = distanceToOutside(shape, width, height);
  const ring = new Uint8Array(shape.length);
  const soft = new Float32Array(shape.length);
  for (let i = 0; i < shape.length; i++) {
    // Formens kant ligger en halv pixel innanför närmaste pixel utanför. Utanför formen är avståndet 0,
    // och den mjuka masken 1 där: ytterkanten följer loggans egna masker.
    const d = Math.max(0, (distance[i] ?? 0) - 0.5);
    soft[i] = Math.min(1, Math.max(0, 0.5 + reach - d));
    if (shape[i] && d <= reach) ring[i] = 1;
  }
  return { shape, ring, soft };
}
