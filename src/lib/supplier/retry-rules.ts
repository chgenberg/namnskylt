/**
 * Reglerna för när en order som inte nådde verkstaden provas igen av sig själv.
 * Rena regler, utan databas, så att de går att testa för sig.
 */

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

/** Väntan efter det första, andra, … misslyckade försöket. Glesare för varje gång. */
const RETRY_DELAYS_MS: readonly number[] = [10 * MINUTE_MS, 30 * MINUTE_MS, 2 * HOUR_MS, 6 * HOUR_MS, 24 * HOUR_MS];

/** Efter så här många försök totalt provar schemat inte fler gånger. För hand går ordern fortfarande att skicka. */
export const MAX_DISPATCH_ATTEMPTS = RETRY_DELAYS_MS.length + 1;

/**
 * När ordern tidigast provas igen. `attempts` är antalet försök som gjorts och
 * `lastFailedAt` när det senaste misslyckades. `null` = provas inte om: ordern
 * har aldrig provats, eller försöken är slut.
 */
export function nextRetryAt(attempts: number, lastFailedAt: Date): Date | null {
  if (!Number.isInteger(attempts) || attempts < 1 || attempts >= MAX_DISPATCH_ATTEMPTS) return null;
  const delay = RETRY_DELAYS_MS[attempts - 1];
  if (delay === undefined || Number.isNaN(lastFailedAt.getTime())) return null;
  return new Date(lastFailedAt.getTime() + delay);
}

/** Verkstaden svarade, men inte med ja. Statusen avgör om det är värt att försöka igen. */
export class SupplierHttpError extends Error {
  constructor(
    readonly status: number,
    detail: string,
  ) {
    super(detail ? `Leverantören svarade ${status}: ${detail}` : `Leverantören svarade ${status}`);
    this.name = "SupplierHttpError";
  }
}

/** Ett fel hos oss som inte går över av sig självt, t.ex. en order som är för stor för ett anrop. */
export class PermanentDispatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentDispatchError";
  }
}

/** Sant för svar som kan gå över: verkstadens egna fel (5xx), tidsgräns (408) och för många anrop (429). */
export function retryableStatus(status: number): boolean {
  return status >= 500 || status === 408 || status === 429;
}

/**
 * Sant när felet inte går över av sig självt: verkstaden nekade ordern (4xx),
 * eller ordern går inte att skicka som den är. Nätfel, tidsgränser och allt
 * okänt räknas som övergående och provas igen.
 */
export function isPermanentFailure(error: unknown): boolean {
  if (error instanceof PermanentDispatchError) return true;
  if (error instanceof SupplierHttpError) return !retryableStatus(error.status);
  return false;
}

/** En order vars utskick har misslyckats, så som schemat ser den. */
export interface FailedDispatch {
  orderNo: string;
  attempts: number;
  /** När det senaste försöket misslyckades. `null` för fel från innan omförsöken fanns. */
  failedAt: Date | null;
  permanent: boolean;
}

/** När schemat provar ordern igen. `null` = aldrig av sig självt; den får skickas för hand. */
export function retryAtFor(order: FailedDispatch): Date | null {
  if (order.permanent || !order.failedAt) return null;
  return nextRetryAt(order.attempts, order.failedAt);
}

/** Ordrarna som ska provas nu, den som väntat längst först. */
export function dueForRetry(orders: readonly FailedDispatch[], now: Date): FailedDispatch[] {
  return orders
    .flatMap((order) => {
      const at = retryAtFor(order);
      return at && at.getTime() <= now.getTime() ? [{ order, at }] : [];
    })
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .map(({ order }) => order);
}

/** Läget för driftsidan: hur många som misslyckats, hur många som provas igen och när. */
export interface RetryOverview {
  failed: number;
  willRetry: number;
  /** Tidigaste nästa försök bland dem som provas igen. */
  nextAt: string | null;
}

export function retryOverview(orders: readonly FailedDispatch[]): RetryOverview {
  const times = orders.flatMap((order) => {
    const at = retryAtFor(order);
    return at ? [at.getTime()] : [];
  });
  return {
    failed: orders.length,
    willRetry: times.length,
    nextAt: times.length > 0 ? new Date(Math.min(...times)).toISOString() : null,
  };
}
