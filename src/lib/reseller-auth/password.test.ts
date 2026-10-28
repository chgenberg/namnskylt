import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hashPassword, verifyPassword } from "./password";

describe("lösenord", () => {
  it("hashas med salt och verifieras", async () => {
    const a = await hashPassword("Hemligt-123");
    const b = await hashPassword("Hemligt-123");
    assert.notEqual(a, b, "olika salt varje gång");
    assert.match(a, /^scrypt\$/);
    assert.equal(await verifyPassword("Hemligt-123", a), true);
    assert.equal(await verifyPassword("hemligt-123", a), false);
  });

  it("avvisar trasiga hashar", async () => {
    assert.equal(await verifyPassword("x", "md5$abc"), false);
    assert.equal(await verifyPassword("x", ""), false);
  });
});
