"use server";

import { z } from "zod";
import { decideProof } from "@/lib/orders/repository";

const decisionSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/),
  approved: z.boolean(),
  comment: z.string().trim().max(1000).optional(),
});

/** Publik — länkens token är behörigheten. Ett beslut kan bara tas en gång per länk. */
export async function decideProofAction(input: z.input<typeof decisionSchema>): Promise<{ ok: boolean; error?: string }> {
  const parsed = decisionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Ogiltigt svar" };
  const { token, approved, comment } = parsed.data;
  if (!approved && !comment) return { ok: false, error: "Skriv vad som ska ändras" };
  try {
    const ok = await decideProof(token, approved, comment || null);
    return ok ? { ok: true } : { ok: false, error: "Korrekturen är redan besvarad" };
  } catch (error) {
    console.error("Korrektursvaret kunde inte sparas", error);
    return { ok: false, error: "Något gick fel. Försök igen." };
  }
}
