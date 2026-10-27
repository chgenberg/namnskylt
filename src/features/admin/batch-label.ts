import { getColor, getMaterial } from "@/engine";
import type { ProductionBatch, ProductionMethod } from "@/lib/production";

export const METHOD_LABEL: Record<ProductionMethod, string> = {
  "plastic-sheet": "Gravyr + skär på ark",
  "metal-cut": "Fiberlaser + metallskärning (DXF)",
};

export function batchLabel(batch: Pick<ProductionBatch, "materialId" | "colorId">): string {
  return `${getMaterial(batch.materialId).name} · ${getColor(batch.materialId, batch.colorId).name}`;
}

/** Verkstadens produktionsnummer, `2026-041`. Mockupen numrerar batcherna i ordning. */
export function productionNumber(batchIndex: number): string {
  return `2026-${String(41 + batchIndex).padStart(3, "0")}`;
}

export function formatSek(value: number): string {
  return `${new Intl.NumberFormat("sv-SE").format(value)} kr`;
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("sv-SE", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Stockholm",
  }).format(new Date(iso));
}
