import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MAX_DISPATCH_ATTEMPTS,
  PermanentDispatchError,
  SupplierHttpError,
  dueForRetry,
  isPermanentFailure,
  nextRetryAt,
  retryAtFor,
  retryOverview,
  retryableStatus,
  type FailedDispatch,
} from "./retry-rules";

const MINUTE_MS = 60_000;
const failedAt = new Date("2026-11-15T10:00:00Z");
const after = (minutes: number) => new Date(failedAt.getTime() + minutes * MINUTE_MS);
const order = (orderNo: string, patch: Partial<FailedDispatch> = {}): FailedDispatch => ({ orderNo, attempts: 1, failedAt, permanent: false, ...patch });

describe("nästa försök att skicka en order till verkstaden", () => {
  it("väntar 10 min, 30 min, 2 h, 6 h och 24 h efter försök 1 till 5", () => {
    assert.deepEqual(
      [1, 2, 3, 4, 5].map((attempts) => nextRetryAt(attempts, failedAt)?.toISOString()),
      [after(10), after(30), after(120), after(360), after(1440)].map((date) => date.toISOString()),
    );
  });

  it("gör aldrig fler än sex försök", () => {
    assert.equal(MAX_DISPATCH_ATTEMPTS, 6);
    assert.equal(nextRetryAt(6, failedAt), null);
    assert.equal(nextRetryAt(60, failedAt), null);
  });

  it("rör aldrig en order som inte har provats", () => {
    assert.equal(nextRetryAt(0, failedAt), null);
    assert.equal(nextRetryAt(-1, failedAt), null);
    assert.equal(nextRetryAt(1.5, failedAt), null);
    assert.equal(nextRetryAt(1, new Date("inte en tid")), null);
  });
});

describe("fel som provas om och fel som inte gör det", () => {
  it("ett nej från verkstaden (4xx) är slutgiltigt", () => {
    for (const status of [400, 401, 403, 404, 409, 413, 422]) {
      assert.equal(isPermanentFailure(new SupplierHttpError(status, "nej")), true, String(status));
    }
  });

  it("verkstadens egna fel, tidsgräns och för många anrop provas igen", () => {
    for (const status of [408, 429, 500, 502, 503, 504]) {
      assert.equal(retryableStatus(status), true, String(status));
      assert.equal(isPermanentFailure(new SupplierHttpError(status, "")), false, String(status));
    }
  });

  it("nätfel och okända fel provas igen, en order som inte går att skicka gör det inte", () => {
    assert.equal(isPermanentFailure(new TypeError("fetch failed")), false);
    assert.equal(isPermanentFailure(new DOMException("The operation was aborted due to timeout", "TimeoutError")), false);
    assert.equal(isPermanentFailure("något"), false);
    assert.equal(isPermanentFailure(new PermanentDispatchError("Ordern är för stor för ett anrop")), true);
  });

  it("felets text är densamma som förut, så att översikten visar samma sak", () => {
    assert.equal(new SupplierHttpError(503, "nere").message, "Leverantören svarade 503: nere");
    assert.equal(new SupplierHttpError(500, "").message, "Leverantören svarade 500");
  });
});

describe("vilka ordrar som provas nu", () => {
  it("tar bara ordrar vars väntan är över, den som väntat längst först", () => {
    const orders = [
      order("NS-1", { attempts: 2 }), // väntar 30 min
      order("NS-2"), // väntar 10 min
      order("NS-3", { attempts: 3 }), // väntar 2 h
    ];
    assert.deepEqual(dueForRetry(orders, after(9)).map((o) => o.orderNo), []);
    assert.deepEqual(dueForRetry(orders, after(10)).map((o) => o.orderNo), ["NS-2"]);
    assert.deepEqual(dueForRetry(orders, after(45)).map((o) => o.orderNo), ["NS-2", "NS-1"]);
    assert.deepEqual(dueForRetry(orders, after(500)).map((o) => o.orderNo), ["NS-2", "NS-1", "NS-3"]);
  });

  it("hoppar över slutgiltiga fel, slut på försök och fel från innan tiden sparades", () => {
    const orders = [order("NS-1", { permanent: true }), order("NS-2", { attempts: 6 }), order("NS-3", { failedAt: null }), order("NS-4")];
    assert.deepEqual(dueForRetry(orders, after(100_000)).map((o) => o.orderNo), ["NS-4"]);
    assert.equal(retryAtFor(orders[0] as FailedDispatch), null);
    assert.equal(retryAtFor(orders[2] as FailedDispatch), null);
  });

  it("sammanfattar läget för driftsidan", () => {
    const orders = [order("NS-1", { attempts: 2 }), order("NS-2"), order("NS-3", { permanent: true })];
    assert.deepEqual(retryOverview(orders), { failed: 3, willRetry: 2, nextAt: after(10).toISOString() });
    assert.deepEqual(retryOverview([]), { failed: 0, willRetry: 0, nextAt: null });
  });
});
