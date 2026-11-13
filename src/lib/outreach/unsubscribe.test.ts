import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { issueLinkToken } from "./link-token";
import { handleUnsubscribe, isUnsubscribeTokenValid, unsubscribeRequestKind, type UnsubscribeDeps } from "./unsubscribe";

const SECRET = "x".repeat(40);
const now = new Date("2026-11-10T10:00:00Z");
const MESSAGE_ID = "6f1c2a52-0000-4000-8000-000000000001";

function fakeDeps() {
  const suppressed = new Map<string, string>();
  const deps: UnsubscribeDeps = {
    secrets: [SECRET],
    now,
    emailForMessage: async (id) => (id === MESSAGE_ID ? "anna@profilab.se" : null),
    suppress: async ({ email, source }) => {
      if (suppressed.has(email)) return false;
      suppressed.set(email, source);
      return true;
    },
  };
  return { deps, suppressed };
}

describe("avregistrering", () => {
  test("ett giltigt token spärrar adressen en gång", async () => {
    const { deps, suppressed } = fakeDeps();
    const token = issueLinkToken("unsubscribe", MESSAGE_ID, SECRET, now);
    assert.deepEqual(await handleUnsubscribe(token, "form", deps), { ok: true, newlySuppressed: true });
    assert.deepEqual(await handleUnsubscribe(token, "one_click", deps), { ok: true, newlySuppressed: false });
    assert.equal(suppressed.size, 1);
    assert.equal(suppressed.get("anna@profilab.se"), "link");
  });

  test("One-Click räknas som egen källa", async () => {
    const { deps, suppressed } = fakeDeps();
    await handleUnsubscribe(issueLinkToken("unsubscribe", MESSAGE_ID, SECRET, now), "one_click", deps);
    assert.equal(suppressed.get("anna@profilab.se"), "one_click");
  });

  test("ett landningstoken vägras", async () => {
    const { deps, suppressed } = fakeDeps();
    const landing = issueLinkToken("landing", MESSAGE_ID, SECRET, now);
    assert.deepEqual(await handleUnsubscribe(landing, "form", deps), { ok: false, reason: "invalid-link" });
    assert.equal(isUnsubscribeTokenValid(landing, [SECRET], now), false);
    assert.equal(suppressed.size, 0);
  });

  test("ett meddelande som inte finns ger ogiltig länk", async () => {
    const { deps } = fakeDeps();
    const token = issueLinkToken("unsubscribe", "6f1c2a52-0000-4000-8000-000000000999", SECRET, now);
    assert.deepEqual(await handleUnsubscribe(token, "form", deps), { ok: false, reason: "invalid-link" });
  });

  test("POST utan rätt kropp känns inte igen", () => {
    assert.equal(unsubscribeRequestKind(""), null);
    assert.equal(unsubscribeRequestKind("confirm=nej"), null);
    assert.equal(unsubscribeRequestKind("List-Unsubscribe=One-Click"), "one_click");
    assert.equal(unsubscribeRequestKind("confirm=ja"), "form");
  });
});
