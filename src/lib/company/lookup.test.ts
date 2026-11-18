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

describe("uppslaget i momsregistret", () => {
  test("frågar registret på momsnumret och svarar med företaget", async () => {
    const { calls, fetchImpl } = register(found);
    const hit = await lookupCompany("5560000001", fetchImpl);
    assert.deepEqual(hit, { name: "Exempel AB", line1: "Storgatan 12", line2: "", zip: "123 45", city: "Exempelstad" });
    assert.deepEqual(calls, ["https://ec.europa.eu/taxation_customs/vies/rest-api/ms/SE/vat/556000000101"]);
  });

  test("samma nummer frågas en gång per dygn", async () => {
    const { calls, fetchImpl } = register(found);
    const now = Date.UTC(2026, 10, 18, 9, 0);
    await lookupCompany("5560000002", fetchImpl, now);
    await lookupCompany("5560000002", fetchImpl, now + 23 * 60 * 60 * 1000);
    assert.equal(calls.length, 1);
    await lookupCompany("5560000002", fetchImpl, now + 25 * 60 * 60 * 1000);
    assert.equal(calls.length, 2);
  });

  test("ett nummer som inte finns ger inget, och frågas om efter en timme", async () => {
    const { calls, fetchImpl } = register(() => Response.json({ isValid: false, userError: "INVALID", name: "---", address: "---" }));
    const now = Date.UTC(2026, 10, 18, 9, 0);
    assert.equal(await lookupCompany("5560000003", fetchImpl, now), null);
    assert.equal(await lookupCompany("5560000003", fetchImpl, now + 30 * 60 * 1000), null);
    assert.equal(calls.length, 1);
    await lookupCompany("5560000003", fetchImpl, now + 61 * 60 * 1000);
    assert.equal(calls.length, 2);
  });

  test("ett register som inte kan svara ger inget och sparas inte, så att nästa försök frågar igen", async () => {
    let answer: () => Response = () => Response.json({ isValid: false, userError: "MS_UNAVAILABLE" });
    const { calls, fetchImpl } = register(() => answer());
    assert.equal(await lookupCompany("5560000004", fetchImpl), null);
    answer = found;
    assert.equal((await lookupCompany("5560000004", fetchImpl))?.name, "Exempel AB");
    assert.equal(calls.length, 2);
  });

  test("ett fel hos registret eller i nätet ger inget, och kastar aldrig", async () => {
    assert.equal(await lookupCompany("5560000005", register(() => new Response("fel", { status: 500 })).fetchImpl), null);
    assert.equal(await lookupCompany("5560000006", register(() => new Response("inte json")).fetchImpl), null);
    const broken = async () => {
      throw new Error("nätet är nere");
    };
    assert.equal(await lookupCompany("5560000007", broken), null);
  });
});
