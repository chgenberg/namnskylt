import { NextResponse } from "next/server";
import { z } from "zod";
import { badgeDocumentSchema } from "@/engine";
import { renderBadgePng } from "@/lib/ai/badge-image";
import { aiUnavailable, generationFailed, takeGenerations, tooManyRequests } from "@/lib/ai/limits";
import { editImage, openai } from "@/lib/ai/openai";
import { PEOPLE_PERSONAS, personaPrompt } from "@/lib/ai/prompts";

export const runtime = "nodejs";
export const maxDuration = 180;

const requestSchema = z.object({ badge: badgeDocumentSchema });

/** Tre genererade svenska personer som bär skylten. */
export async function POST(request: Request) {
  const ai = openai();
  if (!ai) return aiUnavailable();

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ogiltig skylt" }, { status: 400 });
  if (!takeGenerations(request, PEOPLE_PERSONAS.length)) return tooManyRequests();

  const { badge } = parsed.data;
  try {
    const reference = { data: await renderBadgePng(badge), name: "badge.png", type: "image/png" };
    const results = await Promise.allSettled(
      PEOPLE_PERSONAS.map((persona) =>
        editImage(ai, {
          prompt: personaPrompt(badge, persona),
          images: [reference],
          size: "1024x1536",
          quality: "medium",
        }),
      ),
    );
    const images = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
    if (images.length === 0) {
      throw results.find((r): r is PromiseRejectedResult => r.status === "rejected")?.reason;
    }
    return NextResponse.json({ images });
  } catch (error) {
    return generationFailed(error);
  }
}
