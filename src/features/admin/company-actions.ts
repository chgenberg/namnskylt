"use server";

import { z } from "zod";
import { createRateLimiter } from "@/lib/ai/rate-limit";
import { FetchBlockedError } from "@/lib/brand/url";
import { scrapeCompany, type CompanyScrape } from "@/lib/company/scrape";
import { requireReseller } from "@/lib/reseller-auth/session";

const HOUR_MS = 60 * 60 * 1000;
/** Varje läsning når en främmande server och kan kosta en AI-fråga. */
const scrapes = createRateLimiter({ limit: 20, windowMs: HOUR_MS });

export type ScrapeResult = { ok: true; found: CompanyScrape } | { ok: false; error: string };

export async function scrapeCompanyAction(url: string): Promise<ScrapeResult> {
  await requireReseller();
  const parsed = z.string().trim().min(4).max(300).safeParse(url);
  if (!parsed.success) return { ok: false, error: "Skriv in en webbadress" };
  if (!scrapes.take("reseller")) return { ok: false, error: "Många hämtningar på kort tid. Försök igen om en stund." };
  try {
    return { ok: true, found: await scrapeCompany(parsed.data) };
  } catch (error) {
    if (error instanceof FetchBlockedError) return { ok: false, error: "Adressen går inte att hämta. Kontrollera att den stämmer." };
    console.error("Kunde inte läsa företagets hemsida", error);
    return { ok: false, error: "Vi kunde inte läsa sidan. Fyll i uppgifterna själv eller prova en annan adress." };
  }
}
