import { NextResponse } from "next/server";
import { z } from "zod";
import { badgeDocumentSchema } from "@/engine";
import { renderBadgePng } from "@/lib/ai/badge-image";
import { aiUnavailable, generationFailed, takeGenerations, tooManyRequests } from "@/lib/ai/limits";
import { editImage, guessWearer, openai } from "@/lib/ai/openai";
import { UNKNOWN_WEARER, badgeName, personaPrompt } from "@/lib/ai/prompts";

export const runtime = "nodejs";
export const maxDuration = 180;

const requestSchema = z.object({ badge: badgeDocumentSchema });

/** En genererad svensk person som bär skylten — kön och ålder efter namnet på den. */
export async function POST(request: Request) {
  const ai = openai();
  if (!ai) return aiUnavailable();

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ogiltig skylt" }, { status: 400 });
  if (!takeGenerations(request, 1)) return tooManyRequests();

  const { badge } = parsed.data;
  try {
    const name = badgeName(badge);
    const [png, wearer] = await Promise.all([
      renderBadgePng(badge),
      name ? guessWearer(ai, name) : Promise.resolve(UNKNOWN_WEARER),
    ]);
    const image = await editImage(ai, {
      prompt: personaPrompt(badge, wearer),
      images: [{ data: png, name: "badge.png", type: "image/png" }],
      size: "1024x1536",
      quality: "medium",
    });
    return NextResponse.json({ image });
  } catch (error) {
    return generationFailed(error);
  }
}
