import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, test } from "node:test";
import { requireDb } from "@/lib/db/client";
import { countUnreadNotices, insertNotice, listUnreadNotices, markNoticesRead } from "./repository";

/** Körs bara mot en riktig databas med migreringen `022_notices`. */
const url = process.env.DATABASE_URL;

describe("besked i databasen", { skip: !url }, () => {
  const tenant = `notice-test-${randomUUID().slice(0, 8)}`;
  const other = `${tenant}-annan`;

  after(async () => {
    const sql = requireDb();
    await sql`delete from notices where reseller_id in ${sql([tenant, other])}`;
    await sql.end();
  });

  test("ett besked sparas, syns som oläst och bara för sin ägare", async () => {
    const saved = await insertNotice({ tenant, kind: "quote-declined", who: "Exempel AB", detail: "  För dyrt " });
    assert.ok(saved);
    assert.equal(saved.kind, "quote-declined");
    assert.equal(saved.detail, "För dyrt");
    assert.equal(saved.quoteNo, null);
    await insertNotice({ tenant, kind: "application", who: "Sökande AB" });
    await insertNotice({ tenant: other, kind: "order-placed", who: "Annan kund" });

    assert.equal(await countUnreadNotices(tenant), 2);
    assert.equal(await countUnreadNotices(other), 1);
    const listed = await listUnreadNotices(tenant);
    assert.deepEqual(listed.map((n) => n.who).sort(), ["Exempel AB", "Sökande AB"]);
  });

  test("besked märks som lästa per slag eller alla, aldrig någon annans", async () => {
    assert.equal(await countUnreadNotices(tenant, { kind: "application" }), 1);
    assert.equal(await markNoticesRead(tenant, { kind: "application" }), 1);
    assert.equal(await markNoticesRead(tenant, { kind: "application" }), 0);
    assert.equal(await countUnreadNotices(tenant), 1);
    // En order eller offert som inte finns träffar ingenting.
    assert.equal(await markNoticesRead(tenant, { orderNo: "NS-999999999" }), 0);
    assert.equal(await markNoticesRead(tenant, { quoteNo: "OF-999999999" }), 0);
    assert.equal(await markNoticesRead(tenant, { all: true }), 1);
    assert.equal(await countUnreadNotices(tenant), 0);
    assert.equal(await countUnreadNotices(other), 1);
  });
});
