/**
 * Återförsäljarens marginal på en order: kundens pris minus det återförsäljaren
 * betalar enligt prismodellen (`resellerOrder` i motorn).
 */
export interface Margin {
  sek: number;
  /** Andel av försäljningspriset; `null` när inget säljs. */
  percent: number | null;
}

export function marginOf(saleSek: number, purchaseSek: number): Margin {
  const sek = saleSek - purchaseSek;
  return { sek, percent: saleSek > 0 ? Math.round((sek / saleSek) * 100) : null };
}
