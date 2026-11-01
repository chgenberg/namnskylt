import type { BlockKind, ShopContent } from "@/lib/shops/content";

/** Det som dras: en ny blocktyp från paletten, eller ett befintligt block. */
export const DRAG_KIND = "application/x-namnskylt-kind";
export const DRAG_BLOCK = "application/x-namnskylt-block";

export type BlockAction = "up" | "down" | "duplicate" | "remove";

/** Meddelanden mellan editorn och förhandsvisningen i ramen — samma ursprung, aldrig andra. */
export type ToPreview = { type: "ns:state"; content: ShopContent; path: string; selectedId: string | null };
export type FromPreview =
  | { type: "ns:ready" }
  | { type: "ns:select"; blockId: string }
  | { type: "ns:text"; blockId: string; path: string; value: string }
  | { type: "ns:page"; path: string }
  | { type: "ns:drop"; kind: BlockKind; index: number }
  | { type: "ns:move"; blockId: string; index: number }
  | { type: "ns:action"; blockId: string; action: BlockAction };

export function isMessage<T extends { type: string }>(data: unknown, types: readonly T["type"][]): data is T {
  return Boolean(data) && typeof data === "object" && types.includes((data as { type: string }).type as T["type"]);
}
