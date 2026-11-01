import type { ShopContent } from "@/lib/shops/content";

/** Meddelanden mellan editorn och förhandsvisningen i ramen — samma ursprung, aldrig andra. */
export type ToPreview = { type: "ns:state"; content: ShopContent; path: string; selectedId: string | null };
export type FromPreview =
  | { type: "ns:ready" }
  | { type: "ns:select"; blockId: string }
  | { type: "ns:text"; blockId: string; path: string; value: string }
  | { type: "ns:page"; path: string };

export function isMessage<T extends { type: string }>(data: unknown, types: readonly T["type"][]): data is T {
  return Boolean(data) && typeof data === "object" && types.includes((data as { type: string }).type as T["type"]);
}
