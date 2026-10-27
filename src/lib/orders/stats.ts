import { getMaterial, type MaterialId } from "@/engine";
import { badgeCount, type StoredOrder } from "./model";

export interface WeekBucket {
  /** Måndagen veckan började, `YYYY-MM-DD`. */
  weekStart: string;
  label: string;
  revenueSek: number;
  orders: number;
}

export interface OrderStats {
  weeks: WeekBucket[];
  orderCount: number;
  revenueSek: number;
  averageOrderSek: number;
  badgeCount: number;
  materials: { materialId: MaterialId; name: string; badges: number; share: number }[];
  customers: number;
  /** Andel kunder som beställt mer än en gång. */
  repeatCustomerShare: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function mondayOf(date: Date): Date {
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const weekday = (day.getUTCDay() + 6) % 7;
  return new Date(day.getTime() - weekday * DAY_MS);
}

function isoWeek(date: Date): number {
  const thursday = new Date(mondayOf(date).getTime() + 3 * DAY_MS);
  const firstThursday = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4));
  return 1 + Math.round((thursday.getTime() - mondayOf(firstThursday).getTime() - 3 * DAY_MS) / (7 * DAY_MS));
}

export function orderStats(orders: readonly StoredOrder[], now: Date, weeks = 12): OrderStats {
  const counted = orders.filter((o) => o.status !== "cancelled");
  const thisMonday = mondayOf(now);
  const buckets: WeekBucket[] = Array.from({ length: weeks }, (_, i) => {
    const start = new Date(thisMonday.getTime() - (weeks - 1 - i) * 7 * DAY_MS);
    return { weekStart: start.toISOString().slice(0, 10), label: `v.${isoWeek(start)}`, revenueSek: 0, orders: 0 };
  });
  const byWeek = new Map(buckets.map((b) => [b.weekStart, b]));
  for (const order of counted) {
    const bucket = byWeek.get(mondayOf(new Date(order.placedAt)).toISOString().slice(0, 10));
    if (!bucket) continue;
    bucket.revenueSek += order.totalSek;
    bucket.orders += 1;
  }

  const materialBadges = new Map<MaterialId, number>();
  for (const order of counted) {
    for (const badge of order.badges) {
      materialBadges.set(badge.materialId, (materialBadges.get(badge.materialId) ?? 0) + badge.quantity);
    }
  }
  const totalBadges = counted.reduce((sum, o) => sum + badgeCount(o), 0);
  const materials = [...materialBadges]
    .map(([materialId, badges]) => ({
      materialId,
      name: getMaterial(materialId).name,
      badges,
      share: totalBadges ? badges / totalBadges : 0,
    }))
    .sort((a, b) => b.badges - a.badges);

  const perCustomer = new Map<string, number>();
  for (const order of counted) perCustomer.set(order.customer.id, (perCustomer.get(order.customer.id) ?? 0) + 1);
  const repeaters = [...perCustomer.values()].filter((n) => n > 1).length;
  const revenueSek = counted.reduce((sum, o) => sum + o.totalSek, 0);

  return {
    weeks: buckets,
    orderCount: counted.length,
    revenueSek,
    averageOrderSek: counted.length ? Math.round(revenueSek / counted.length) : 0,
    badgeCount: totalBadges,
    materials,
    customers: perCustomer.size,
    repeatCustomerShare: perCustomer.size ? repeaters / perCustomer.size : 0,
  };
}
