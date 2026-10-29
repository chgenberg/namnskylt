/** Det butiksstatistiken räknar: besök i butiken, visningar på återförsäljarens sajt, öppnade skyltmotorer. */
export const SHOP_EVENT_KINDS = ["visit", "embed", "design"] as const;
export type ShopEventKind = (typeof SHOP_EVENT_KINDS)[number];

export const SHOP_EVENT_PATH = "/api/shop-events";
