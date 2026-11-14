import type { PriceModel } from "./price-model";

/**
 * Kalkylen från 2026-11-13. Gäller tills något annat sparats i admin.
 *
 * Siffrorna är inköpspriser och provision. Filen exporteras därför inte från
 * `@/engine`, och bara serverkod (`server-only`), skript och tester får
 * importera den — annars bakas siffrorna in i webbläsarens JavaScript, som
 * vem som helst kan läsa. `price-lists.test.ts` kontrollerar det.
 */
export const DEFAULT_PRICE_MODEL: PriceModel = {
  tiers: [
    { moreThan: 0, provisionPercent: 15 },
    { moreThan: 100, provisionPercent: 12 },
    { moreThan: 300, provisionPercent: 10 },
    { moreThan: 500, provisionPercent: 8 },
  ],
  signs: {
    premium: [73, 68, 64, 61],
    standard: [54, 50, 47, 43],
  },
  options: {
    customShape: [19, 19, 19, 19],
    extraEngraving: [19, 19, 19, 19],
    pin: [5, 5, 5, 5],
    clip: [9, 9, 9, 9],
    magnet: [11, 11, 11, 11],
  },
  startSek: 200,
  minOrderSek: 299,
  endMarginPercent: 40,
  endMinOrderSek: 299,
  // Skylt & Gravyrtekniks frakt 2026-11-14: varubrev 75 kr upp till 500 kr i varuvärde, annars paket 159 kr.
  shipping: { letterSek: 75, parcelSek: 159, letterMaxSek: 500 },
};
