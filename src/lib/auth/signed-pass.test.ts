import assert from "node:assert/strict";
import { test } from "node:test";
import { signedPass } from "./signed-pass";

function withEnv(name: string, value: string | undefined, run: () => Promise<void>) {
  return async () => {
    const before = process.env[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
    try {
      await run();
    } finally {
      if (before === undefined) delete process.env[name];
      else process.env[name] = before;
    }
  };
}

const a = signedPass({ envVar: "TEST_PASS_A", purpose: "a", cookie: "a" });
const b = signedPass({ envVar: "TEST_PASS_A", purpose: "b", cookie: "b" });

test(
  "två syften med samma kod ger olika kakor",
  withEnv("TEST_PASS_A", "Kod-1%", async () => {
    const tokenA = await a.token();
    assert.equal(await a.verify(tokenA), true);
    assert.equal(await b.verify(tokenA), false);
  }),
);

test(
  "utan kod i miljön godtas varken kod eller kaka",
  withEnv("TEST_PASS_A", undefined, async () => {
    assert.equal(a.configured(), false);
    assert.equal(a.matches(""), false);
    assert.equal(await a.verify("x"), false);
    await assert.rejects(a.token());
  }),
);

test(
  "byts koden slutar gamla kakor gälla",
  async () => {
    let old = "";
    await withEnv("TEST_PASS_A", "första", async () => {
      old = await a.token();
    })();
    await withEnv("TEST_PASS_A", "andra", async () => {
      assert.equal(await a.verify(old), false);
    })();
  },
);
