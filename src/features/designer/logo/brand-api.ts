import type { BrandProfile } from "@/lib/brand/profile";

export type { BrandProfile };

export async function requestBrand(url: string): Promise<BrandProfile> {
  const response = await fetch("/api/brand", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url }),
  });
  const body = (await response.json().catch(() => null)) as (BrandProfile & { error?: string }) | null;
  if (!response.ok || !body) throw new Error(body?.error ?? "Vi kunde inte läsa sidan. Försök igen.");
  return body;
}
