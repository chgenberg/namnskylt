import { z } from "zod";
import { MARKING_METHOD_IDS, priceItemsOf, type BadgeDocument, type PriceItem } from "@/engine";

/**
 * Frakten är samma i alla led och räknas på det återförsäljaren betalar
 * verkstaden för varorna. Kundens webbläsare har inte de priserna, så den
 * frågar servern och får bara beloppet tillbaka.
 */
export const SHIPPING_PATH = "/api/shipping";

const itemSchema = z.strictObject({
  signClass: z.enum(["premium", "standard"]),
  mounting: z.enum(["pin", "magnet", "clip", "safety-pin"]),
  extraEngraving: z.boolean(),
  customShape: z.boolean(),
  marking: z.enum(MARKING_METHOD_IDS).optional(),
  frame: z.boolean().optional(),
  quantity: z.number().int().min(1).max(10_000_000),
});

/**
 * Två skylttyper, fyra fästen, med eller utan egen form, två märkningsmetoder
 * utan logga eller fyra med, och med eller utan ram ger högst 192 olika rader.
 */
export const shippingRequestSchema = z.strictObject({ items: z.array(itemSchema).min(1).max(192) });

const typeKey = (item: PriceItem) =>
  `${item.signClass}|${item.mounting}|${item.extraEngraving}|${item.customShape}|${item.marking ?? ""}|${item.frame ? "ram" : ""}`;

/**
 * Det servern behöver för att räkna frakten: skyltarna utan design och text,
 * med likadana skyltar hopslagna. Priset beror bara på skylttypen och orderns
 * antal, så hundra namn på samma skylt blir en rad.
 */
export function shippingItems(badges: readonly BadgeDocument[]): PriceItem[] {
  const merged = new Map<string, PriceItem>();
  for (const item of priceItemsOf(badges)) {
    const quantity = Math.max(1, Math.floor(item.quantity));
    const same = merged.get(typeKey(item));
    merged.set(typeKey(item), { ...item, quantity: (same?.quantity ?? 0) + quantity });
  }
  return [...merged.values()].sort((a, b) => typeKey(a).localeCompare(typeKey(b)));
}
