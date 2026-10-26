import "server-only";
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { clientKey, createRateLimiter } from "./rate-limit";

/** Varje bild kostar pengar — en besökare får skapa så här många per timme. */
export const GENERATIONS_PER_HOUR = 12;
/** Tak för hela sajten, så att förfalskade IP-adresser inte ger obegränsat. */
export const SITE_GENERATIONS_PER_HOUR = 240;

const HOUR_MS = 60 * 60 * 1000;
const perClient = createRateLimiter({ limit: GENERATIONS_PER_HOUR, windowMs: HOUR_MS });
const site = createRateLimiter({ limit: SITE_GENERATIONS_PER_HOUR, windowMs: HOUR_MS });

/** `false` = besökaren eller sajten har nått timgränsen. */
export function takeGenerations(request: Request, count = 1): boolean {
  return perClient.take(clientKey(request), count) && site.take("site", count);
}

export function tooManyRequests() {
  return NextResponse.json(
    { error: "Du har skapat många bilder på kort tid. Försök igen om en stund." },
    { status: 429 },
  );
}

export function aiUnavailable() {
  return NextResponse.json({ error: "Bildfunktionen är inte aktiverad." }, { status: 503 });
}

/** Svensk förklaring till kunden; detaljer loggas på servern. */
export function generationFailed(error: unknown) {
  if (error instanceof OpenAI.APIError && error.code === "moderation_blocked") {
    return NextResponse.json(
      { error: "Bilden stoppades av säkerhetsfiltret. Prova ett annat foto." },
      { status: 422 },
    );
  }
  console.error("Bildgenereringen misslyckades", error);
  return NextResponse.json({ error: "Bilden kunde inte skapas just nu. Försök igen." }, { status: 502 });
}
