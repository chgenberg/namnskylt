import "server-only";
import { requireDb } from "@/lib/db/client";
import { supplierApiConfigured } from "./client";
import { dispatchOrder } from "./dispatch";
import { dueForRetry, retryOverview, type RetryOverview } from "./retry-rules";
import { selectFailedDispatches } from "./retry-store";

/** Ett varv tar högst så här många ordrar, så att det aldrig drar ut i timmar. */
const MAX_PER_RUN = 10;

interface RetryResult {
  /** Falskt när kopplingen till verkstaden är av. Då görs ingenting. */
  connected: boolean;
  /** Ordrar som var dags att prova i det här varvet. */
  tried: number;
  sent: number;
  failed: number;
  /** Ordrar som inte gick att skicka nu: de saknar uppgifter eller skickas redan av någon annan. */
  skipped: number;
}

/**
 * Provar igen att skicka ordrar som inte nådde Skylt & Gravyrteknik. Gör
 * ingenting utan `SUPPLIER_API_URL` och `SUPPLIER_API_KEY`.
 *
 * Bara ordrar som redan har ett misslyckat försök tas, glesare för varje gång
 * (`nextRetryAt`) och aldrig fel som inte går över av sig själva. En order som
 * bara väntar rörs aldrig: det finns med flit ingen funktion som skickar alla
 * väntande, eftersom gamla testordrar då skulle tillverkas.
 */
export async function retryFailedDispatches(options: { now?: Date; tenant?: string; limit?: number } = {}): Promise<RetryResult> {
  const result: RetryResult = { connected: supplierApiConfigured(), tried: 0, sent: 0, failed: 0, skipped: 0 };
  if (!result.connected) return result;
  const failed = await selectFailedDispatches(requireDb(), options.tenant);
  const due = dueForRetry(failed, options.now ?? new Date()).slice(0, options.limit ?? MAX_PER_RUN);
  for (const order of due) {
    result.tried++;
    // En i taget: verkstaden ska inte få en skur av anrop när den just har kommit tillbaka.
    const outcome = await dispatchOrder(order.orderNo);
    if (outcome.ok) result.sent++;
    else if (outcome.reason === "failed") result.failed++;
    else result.skipped++;
  }
  return result;
}

/** Jobbets rad på driftsidan. */
export function retryNote(result: RetryResult): string {
  if (!result.connected) return "Kopplingen till verkstaden är av, inget provades";
  if (result.tried === 0) return "Inga ordrar att prova";
  return `${result.tried} provade: ${result.sent} skickade, ${result.failed} misslyckades, ${result.skipped} hoppades över`;
}

/** Läget för driftsidan: ordrar vars utskick misslyckats och när nästa försök görs. */
export async function dispatchRetryOverview(): Promise<RetryOverview> {
  return retryOverview(await selectFailedDispatches(requireDb()));
}
