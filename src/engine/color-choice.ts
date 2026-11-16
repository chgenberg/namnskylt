import type { ColorCombo } from "./catalog";

/**
 * Färgvalet i två steg. En tvålagersplast har en färg på framsidan och en i
 * kärnan, som gravyren frilägger. Kunden väljer framsidans färg, och kärnans
 * färg bara där samma framsida finns med flera kärnor (vit med svart, blå
 * eller röd). Skylten bär fortfarande kombinationens id, så inget annat i
 * motorn behöver känna till stegen.
 */

/** Framsidans och kärnans namn ur kombinationens namn, `Vit / Svart`. Ett material med en enda färg har ingen kärna. */
export function colorNames(combo: Pick<ColorCombo, "name">): { front: string; core: string | null } {
  const [front, core] = combo.name.split(" / ").map((part) => part.trim());
  return { front: front || combo.name, core: core || null };
}

export interface FrontChoice {
  /** Framsidans namn, `Vit`. */
  name: string;
  /** Kombinationen som väljs med den här framsidan. */
  combo: ColorCombo;
  selected: boolean;
}

export interface CoreChoice {
  /** Kärnans namn, `Svart`. */
  name: string;
  combo: ColorCombo;
  selected: boolean;
}

export interface ColorChoices {
  /** En per framsida, i listans ordning. */
  fronts: FrontChoice[];
  /** Kärnorna som den valda framsidan finns med. Tom när det bara finns en. */
  cores: CoreChoice[];
}

/**
 * Valen för en lista av kombinationer och den som är vald. Byter kunden
 * framsida behålls kärnans färg om den nya framsidan finns med den, annars
 * gäller framsidans första kombination.
 */
export function colorChoices(colors: readonly ColorCombo[], selectedId: string): ColorChoices {
  const selected = colors.find((combo) => combo.id === selectedId) ?? null;
  const bySurface = new Map<string, ColorCombo[]>();
  for (const combo of colors) {
    const group = bySurface.get(combo.surface);
    if (group) group.push(combo);
    else bySurface.set(combo.surface, [combo]);
  }
  const fronts = [...bySurface.values()].map((group): FrontChoice => {
    const first = group[0] as ColorCombo;
    const isSelected = selected !== null && group.includes(selected);
    const combo = isSelected ? selected : (group.find((c) => c.engraving === selected?.engraving) ?? first);
    return { name: colorNames(combo).front, combo, selected: isSelected };
  });
  const group = selected ? (bySurface.get(selected.surface) ?? []) : [];
  const cores = group.length > 1 ? group.map((combo): CoreChoice => ({ name: colorNames(combo).core ?? combo.name, combo, selected: combo === selected })) : [];
  return { fronts, cores };
}
