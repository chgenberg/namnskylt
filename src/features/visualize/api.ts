import type { BadgeDocument } from "@/engine";

async function readResult<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok || !body) throw new Error(body?.error ?? "Något gick fel. Försök igen.");
  return body;
}

export async function requestPerson(badge: BadgeDocument, workplace: string, signal?: AbortSignal): Promise<string> {
  const response = await fetch("/api/visualize/people", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ badge, workplace: workplace.trim() || undefined }),
    signal,
  });
  return (await readResult<{ image: string }>(response)).image;
}

export async function requestTryOn(badge: BadgeDocument, photo: Blob, signal?: AbortSignal): Promise<string> {
  const form = new FormData();
  form.set("badge", JSON.stringify(badge));
  form.set("photo", photo, "photo.jpg");
  const response = await fetch("/api/visualize/try-on", { method: "POST", body: form, signal });
  return (await readResult<{ image: string }>(response)).image;
}
