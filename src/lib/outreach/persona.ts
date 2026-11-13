import "server-only";
import type OpenAI from "openai";
import type { BadgeDocument } from "@/engine";
import { renderBadgePng } from "@/lib/ai/badge-image";
import { describeCompany, editImage, guessWearer } from "@/lib/ai/openai";
import { badgeName, cleanWorkplace, personaPrompt, UNKNOWN_WEARER } from "@/lib/ai/prompts";
import { parsePage } from "@/lib/brand/parse-html";
import { scrapeBrand } from "@/lib/brand/profile";
import { safeFetch } from "@/lib/brand/safe-fetch";
import { dataUrlBytes } from "./trace-logo-server";
import { personaJpeg } from "./persona-image";

const PAGE_LIMITS = { maxBytes: 2_000_000, timeoutMs: 7_000, accept: "text/html,application/xhtml+xml" };

export type PersonaQuality = "medium" | "high";

async function workplaceFromSource(ai: OpenAI, url: string): Promise<string | null> {
  const page = await safeFetch(url, PAGE_LIMITS);
  if (!/html/i.test(page.contentType)) return null;
  const signals = parsePage(page.body.toString("utf8"), page.url);
  const company = await describeCompany(ai, {
    url: page.url,
    title: signals.title,
    description: signals.description,
    text: signals.text,
  });
  return cleanWorkplace(company?.workplace);
}

/**
 * Miljön där kundens personal bär skyltar, ur startsidan. Sajter som stänger
 * ute enkla anrop läses i webbläsaren. Fel → `null`, då blir miljön neutral.
 */
export async function companyWorkplace(ai: OpenAI, host: string): Promise<string | null> {
  const url = host.startsWith("http") ? host : `https://${host}`;
  const direct = await workplaceFromSource(ai, url).catch(() => null);
  if (direct) return direct;
  try {
    return cleanWorkplace((await scrapeBrand(url)).company?.workplace);
  } catch {
    return null;
  }
}

/**
 * En genererad person i kundens miljö som bär just den här skylten. Skylten
 * renderas ur dokumentet och skickas som referens, så loggan och texten är kundens.
 */
export async function generatePersona(
  ai: OpenAI,
  doc: BadgeDocument,
  workplace: string | null,
  quality: PersonaQuality = "medium",
): Promise<{ bytes: Buffer; width: number; height: number }> {
  const name = badgeName(doc);
  const [png, wearer] = await Promise.all([renderBadgePng(doc), name ? guessWearer(ai, name) : UNKNOWN_WEARER]);
  const image = await editImage(ai, {
    prompt: personaPrompt(doc, wearer, workplace),
    images: [{ data: png, name: "badge.png", type: "image/png" }],
    size: "1024x1536",
    quality,
  });
  const bytes = dataUrlBytes(image);
  if (!bytes) throw new Error("Bildmodellen returnerade ingen läsbar bild");
  return personaJpeg(bytes);
}
