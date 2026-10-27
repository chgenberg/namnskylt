export type Rgb = readonly [number, number, number];

export function parseCssColor(value: string): Rgb | null {
  const v = value.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3,8})$/.exec(v)?.[1];
  if (hex) {
    const short = hex.length === 3 || hex.length === 4;
    if (!short && hex.length !== 6 && hex.length !== 8) return null;
    const channel = (i: number) =>
      short ? parseInt(hex.charAt(i).repeat(2), 16) : parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    return [channel(0), channel(1), channel(2)];
  }
  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(v);
  if (rgb) return [clampByte(Number(rgb[1])), clampByte(Number(rgb[2])), clampByte(Number(rgb[3]))];
  const hsl = /^hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%/.exec(v);
  if (hsl) return hslToRgb(Number(hsl[1]), Number(hsl[2]) / 100, Number(hsl[3]) / 100);
  return null;
}

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function hslToRgb(h: number, s: number, l: number): Rgb {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [clampByte(f(0) * 255), clampByte(f(8) * 255), clampByte(f(4) * 255)];
}

export function toHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((c) => clampByte(c).toString(16).padStart(2, "0")).join("")}`;
}

/** Mättnad och ljushet i HSL, 0–1. */
export function saturationLightness([r, g, b]: Rgb): { saturation: number; lightness: number } {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const lightness = (max + min) / 2;
  const d = max - min;
  const saturation = d === 0 ? 0 : d / (1 - Math.abs(2 * lightness - 1));
  return { saturation, lightness };
}

/** En varumärkesfärg — inte vitt, svart eller grått. */
export function isBrandColor(rgb: Rgb): boolean {
  const { saturation, lightness } = saturationLightness(rgb);
  return saturation >= 0.25 && lightness > 0.1 && lightness < 0.9;
}

function toLab([r, g, b]: Rgb): [number, number, number] {
  const linear = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const [lr, lg, lb] = [linear(r), linear(g), linear(b)];
  const x = (lr * 0.4124 + lg * 0.3576 + lb * 0.1805) / 0.95047;
  const y = lr * 0.2126 + lg * 0.7152 + lb * 0.0722;
  const z = (lr * 0.0193 + lg * 0.1192 + lb * 0.9505) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

/** Färgavstånd som ögat upplever det (CIE76). */
export function colorDistance(a: Rgb, b: Rgb): number {
  const [l1, a1, b1] = toLab(a);
  const [l2, a2, b2] = toLab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}
