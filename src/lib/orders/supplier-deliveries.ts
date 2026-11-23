import { z } from "zod";
import type { BadgeDocument } from "@/engine";
import { supplierDeliverySchema } from "@/lib/supplier/status";
import type { SupplierDelivery } from "@/lib/supplier/types";
import { splitByProducer } from "./partner";

/**
 * Leveranserna när verkstaden har delat en order på flera adresser (beslut av ägaren 2026-11-23).
 * Kunden skriver vilka namn som ska vart i leveransspecifikationen; personalen delar upp namnen på
 * fliken Namnskylt hos sig, och verkstaden skickar tillbaka leveranserna och den extra frakten.
 * Det är fortfarande en order och en faktura. Varje leverans har sin följesedel,
 * `/f/<kod>?leverans=<n>`, med sina namn och sin adress.
 *
 * Reglerna här är rena och delas av följesedeln, panelen och kundens ordersida.
 */

const storedSchema = z.array(supplierDeliverySchema).max(50);

/** Leveranserna som de är sparade på ordern. Tom lista när ordern går till en adress eller raden är trasig. */
export function parseSupplierDeliveries(value: unknown): SupplierDelivery[] {
  const parsed = storedSchema.safeParse(value);
  return parsed.success ? [...parsed.data].sort((a, b) => a.position - b.position) : [];
}

/**
 * Skyltarna i en leverans. Raderna i anropet till verkstaden är orderns skyltar som verkstaden gör,
 * i orderns ordning, så rad n är den n:te av dem.
 */
export function deliveryBadges(badges: readonly BadgeDocument[], delivery: Pick<SupplierDelivery, "lines">): BadgeDocument[] {
  const { workshop } = splitByProducer(badges);
  return [...new Set(delivery.lines)]
    .sort((a, b) => a - b)
    .map((line) => workshop[line - 1])
    .filter((badge): badge is BadgeDocument => Boolean(badge));
}

/** Leveransen med ett visst nummer, eller `null`. */
export function deliveryAt(deliveries: readonly SupplierDelivery[], position: number): SupplierDelivery | null {
  return deliveries.find((delivery) => delivery.position === position) ?? null;
}

/** Leveransens nummer ur adressens `?leverans=`, eller `null` när det saknas eller inte är ett tal. */
export function deliveryParam(value: string | null): number | null {
  if (value === null || !/^\d{1,2}$/.test(value)) return null;
  const position = Number(value);
  return position >= 1 ? position : null;
}

/** Vart leveransen ska, som rader. */
export function supplierDeliveryLines(delivery: SupplierDelivery): string[] {
  return [
    delivery.name,
    delivery.contactName ? `Att: ${delivery.contactName}` : null,
    delivery.line1,
    delivery.line2,
    `${delivery.zip} ${delivery.city}`,
    delivery.phone,
  ].filter((line): line is string => Boolean(line));
}

/** Antal skyltar i leveransen. */
export function deliveryQuantity(badges: readonly BadgeDocument[], delivery: Pick<SupplierDelivery, "lines">): number {
  return deliveryBadges(badges, delivery).reduce((sum, badge) => sum + badge.quantity, 0);
}
