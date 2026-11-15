import type { Instrumentation } from "next";

/**
 * Körs en gång när servern startar. Startar bakgrundsjobben (nya försök att
 * skicka ordrar till verkstaden, rensning av felloggen). Bara i Node: samma
 * fil byggs också för Edge, där middleware körs och databasen inte finns.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const [{ startScheduler }, { JOBS }] = await Promise.all([import("@/lib/maintenance/scheduler"), import("@/lib/maintenance/jobs")]);
    startScheduler(JOBS);
  }
}

/**
 * Varje fel som en sida, en API-väg eller en serverfunktion kastar sparas i
 * felloggen och syns under Drift i panelen. Bara ruttens mönster sparas
 * (`/offert/[token]`), aldrig sökvägen, frågesträngen, huvuden eller innehåll.
 * Sparandet väntar förfrågan inte på.
 */
export const onRequestError: Instrumentation.onRequestError = (error, request, context) => {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    void import("@/lib/maintenance/error-log")
      .then(({ logServerError }) => logServerError("request", withKind(error, request.method, context.routeType), context.routePath))
      .catch(() => undefined);
  }
};

/** Felet som det är; metoden och ruttens slag läggs först i stacken, så att GET och POST på samma rutt går att skilja åt. */
function withKind(error: unknown, method: string, routeType: string): unknown {
  if (!(error instanceof Error) || !/^[A-Z]{3,7}$/.test(method)) return error;
  const copy = new Error(error.message);
  copy.stack = `${method} ${routeType}\n${error.stack ?? ""}`;
  (copy as { digest?: unknown }).digest = (error as { digest?: unknown }).digest;
  return copy;
}
