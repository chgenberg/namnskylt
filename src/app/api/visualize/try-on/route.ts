import { NextResponse } from "next/server";
import { badgeDocumentSchema } from "@/engine";
import { renderBadgePng } from "@/lib/ai/badge-image";
import { aiUnavailable, generationFailed, takeGenerations, tooManyRequests } from "@/lib/ai/limits";
import { checkPhoto, editImage, openai } from "@/lib/ai/openai";
import { isUsablePhoto, photoRejection } from "@/lib/ai/photo-check";
import { tryOnPrompt } from "@/lib/ai/prompts";

export const runtime = "nodejs";
export const maxDuration = 180;

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
/** Fotot plus skyltdokument och multipart-ram. */
const MAX_REQUEST_BYTES = MAX_PHOTO_BYTES + 256 * 1024;
const PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function badRequest(error: string) {
  return NextResponse.json({ error }, { status: 400 });
}

/**
 * Kundens eget foto med skylten på. Fotot kontrolleras först (en person,
 * halv- eller helkropp) så att vi inte genererar på en bild som inte går.
 * Fotot sparas inte — det skickas bara vidare till OpenAI.
 */
export async function POST(request: Request) {
  const ai = openai();
  if (!ai) return aiUnavailable();

  const declaredBytes = Number(request.headers.get("content-length") ?? 0);
  if (declaredBytes > MAX_REQUEST_BYTES) {
    return NextResponse.json({ error: "Fotot är för stort (max 10 MB)" }, { status: 413 });
  }

  const form = await request.formData().catch(() => null);
  const photo = form?.get("photo");
  const badgeJson = form?.get("badge");
  if (!(photo instanceof File) || typeof badgeJson !== "string") return badRequest("Foto saknas");
  if (!PHOTO_TYPES.has(photo.type)) return badRequest("Fotot måste vara JPEG, PNG eller WebP");
  if (photo.size > MAX_PHOTO_BYTES) return badRequest("Fotot är för stort (max 10 MB)");

  let badgeInput: unknown;
  try {
    badgeInput = JSON.parse(badgeJson);
  } catch {
    return badRequest("Ogiltig skylt");
  }
  const badge = badgeDocumentSchema.safeParse(badgeInput);
  if (!badge.success) return badRequest("Ogiltig skylt");
  if (!takeGenerations(request)) return tooManyRequests();

  try {
    const person = { data: Buffer.from(await photo.arrayBuffer()), name: "photo", type: photo.type };
    const check = await checkPhoto(ai, person);
    if (!isUsablePhoto(check)) {
      return NextResponse.json({ error: photoRejection(check) }, { status: 422 });
    }

    const image = await editImage(ai, {
      prompt: tryOnPrompt(badge.data),
      images: [person, { data: await renderBadgePng(badge.data), name: "badge.png", type: "image/png" }],
      size: "auto",
      quality: "high",
    });
    return NextResponse.json({ image });
  } catch (error) {
    return generationFailed(error);
  }
}
