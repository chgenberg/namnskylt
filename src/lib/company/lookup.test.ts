import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { lookupCompany } from "./lookup";

/** Registret är utbytt mot en låtsasmottagare: inget anrop lämnar datorn. */
function register(answer: () => Response | Promise<Response>) {
  const calls: string[] = [];
  const fetchImpl = async (url: string) => {
    calls.push(url);
    return answer();
  };
  return { calls, fetchImpl };
}

const found = () => Response.json({ isValid: true, userError: "VALID", name: "Exempel AB", address: "STORGATAN 12 \n123 45 EXEMPELSTAD" });

/** Ingen riktig väntan i testerna. */
const noPause = async () => {};
const ask = (digits: string, fetchImpl: Parameters<typeof lookupCompany>[1], now?: number) => lookupCompany(digits, fetchImpl, now, noPause);

describe("uppslaget i momsregistret", () => {
  test("frågar registret på momsnumret och svarar med företaget", async () => {
    const { calls, fetchImpl } = register(found);
    const result = await ask("5560000001", fetchImpl);
    assert.deepEqual(result, { kind: "found", company: { name: "Exempel AB", line1: "Storgatan 12", line2: "", zip: "123 45", city: "Exempelstad" } });
    assert.deepEqual(calls, ["https://ec.europa.eu/taxation_customs/vies/rest-api/ms/SE/vat/556000000101"]);
  });

  test("samma nummer frågas en gång per dygn", async () => {
    const { calls, fetchImpl } = register(found);
    const now = Date.UTC(2026, 10, 18, 9, 0);
    await ask("5560000002", fetchImpl, now);
    await ask("5560000002", fetchImpl, now + 23 * 60 * 60 * 1000);
    assert.equal(calls.length, 1);
    await ask("5560000002", fetchImpl, now + 25 * 60 * 60 * 1000);
    assert.equal(calls.length, 2);
  });

  test("ett nummer som registret säger inte finns är missing, och frågas om efter en timme", async () => {
    const { calls, fetchImpl } = register(() => Response.json({ isValid: false, userError: "INVALID", name: "---", address: "---" }));
    const now = Date.UTC(2026, 10, 18, 9, 0);
    assert.deepEqual(await ask("5560000003", fetchImpl, now), { kind: "missing" });
    assert.deepEqual(await ask("5560000003", fetchImpl, now + 30 * 60 * 1000), { kind: "missing" });
    assert.equal(calls.length, 1);
    await ask("5560000003", fetchImpl, now + 61 * 60 * 1000);
    assert.equal(calls.length, 2);
  });

  test("svarar registret inte görs ett nytt försök, och ett svar då gäller", async () => {
    let n = 0;
    const { calls, fetchImpl } = register(() => (++n === 1 ? Response.json({ isValid: false, userError: "MS_MAX_CONCURRENT_REQ" }) : found()));
    assert.equal((await ask("5560000008", fetchImpl)).kind, "found");
    assert.equal(calls.length, 2);
  });

  test("ett register som inte kan svara är unavailable, aldrig missing, och sparas inte", async () => {
    let answer: () => Response = () => Response.json({ isValid: false, userError: "MS_UNAVAILABLE" });
    const { calls, fetchImpl } = register(() => answer());
    assert.deepEqual(await ask("5560000004", fetchImpl), { kind: "unavailable" });
    assert.equal(calls.length, 2);
    answer = found;
    assert.equal((await ask("5560000004", fetchImpl)).kind, "found");
    assert.equal(calls.length, 3);
  });

  test("ett fel hos registret, i nätet eller en tidsgräns är unavailable, och kastar aldrig", async () => {
    assert.deepEqual(await ask("5560000005", register(() => new Response("fel", { status: 500 })).fetchImpl), { kind: "unavailable" });
    assert.deepEqual(await ask("5560000006", register(() => new Response("inte json")).fetchImpl), { kind: "unavailable" });
    const broken = async () => {
      throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    };
    assert.deepEqual(await ask("5560000007", broken), { kind: "unavailable" });
  });
});
