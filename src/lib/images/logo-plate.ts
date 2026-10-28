/** Andel genomskinliga pixlar som gör att loggan saknar egen bakgrund. */
const TRANSPARENT_SHARE = 0.15;
/** Medelljushet (0–1) på loggans synliga pixlar som räknas som vit logga. */
const LIGHT_LUMINANCE = 0.8;

/**
 * `true` när pixlarna (RGBA) är en ljus logga på genomskinlig botten — den
 * försvinner på vitt. Samma bedömning på servern (sharp) och i webbläsaren (canvas).
 */
export function isLightPixels(data: ArrayLike<number>, channels = 4): boolean {
  let transparent = 0;
  let visible = 0;
  let luminance = 0;
  for (let i = 0; i < data.length; i += channels) {
    const alpha = (data[i + 3] ?? 0) / 255;
    if (alpha < 0.125) {
      transparent++;
      continue;
    }
    const [r, g, b] = [data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0];
    luminance += ((0.2126 * r + 0.7152 * g + 0.0722 * b) / 255) * alpha;
    visible += alpha;
  }
  const pixels = data.length / channels;
  return visible > 0 && transparent / pixels >= TRANSPARENT_SHARE && luminance / visible >= LIGHT_LUMINANCE;
}

/** Plattan bakom en ljus logga: butikens färg när den är mörk nog, annars nästan svart. */
export function darkPlate(primaryColor: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(primaryColor.slice(i, i + 2), 16) / 255) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.45 ? primaryColor : "#111418";
}

export const LOGO_SAMPLE_PX = 64;
