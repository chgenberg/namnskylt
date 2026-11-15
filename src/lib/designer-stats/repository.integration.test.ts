import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { after, describe, test } from "node:test";
import { requireDb } from "@/lib/db/client";
import { designerFunnelRows, designerScopes, pruneDesignerEvents, recordDesignerEvent } from "./repository";

/** Körs bara mot en riktig databas med migreringen `028_…`. */
const url = process.env.DATABASE_URL;

describe("skyltmotorns händelser i databasen", { skip: !url }, () => {
  /** Ett eget sammanhang, så att testet varken läser eller rör riktiga besök. */
  const scope = `funnel-test-${randomBytes(4).toString("hex")}`;
  const visits: string[] = [];
  const visit = () => {
    const id = randomBytes(8).toString("hex");
    visits.push(id);
    return id;
  };

  after(async () => {
    const sql = requireDb();
    await sql`delete from designer_events where scope = ${scope}`;
    for (const id of visits) await sql`delete from designer_events where visit = ${id}`;
    await sql.end();
  });

  test("ett steg sparas en gång per besök, och en butik som inte finns sparas inte", async () => {
    const sql = requireDb();
    const id = visit();
    await recordDesignerEvent(id, "web", "open");
    await recordDesignerEvent(id, "web", "open");
    await recordDesignerEvent(id, "web", "text");
    await recordDesignerEvent(visit(), scope, "open");
    const rows = await sql<{ visit: string; scope: string; step: string }[]>`
      select visit, scope, step from designer_events where visit in ${sql([visits[0] ?? "", visits[1] ?? ""])} order by step`;
    assert.deepEqual(rows.map((row) => `${row.scope}:${row.step}`), ["web:open", "web:text"]);
  });

  test("besöken räknas efter hur långt de kom, bara i sitt sammanhang och sin period", async () => {
    const sql = requireDb();
    const insert = (id: string, step: string, daysAgo = 0) =>
      sql`insert into designer_events (visit, scope, step, at) values (${id}, ${scope}, ${step}, now() - make_interval(days => ${daysAgo}))`;
    const a = visit(); // öppnade bara
    const b = visit(); // kom till kassan utan att göra ett val
    const c = visit(); // order mottagen, och använde varukorgen
    const old = visit(); // utanför perioden
    await insert(a, "open");
    for (const step of ["open", "text", "checkout"]) await insert(b, step);
    for (const step of ["open", "text", "choice", "cart", "checkout", "submitted", "ordered"]) await insert(c, step);
    await insert(old, "open", 40);

    assert.deepEqual(await designerFunnelRows(scope), { furthest: [1, 0, 0, 1, 0, 1], cartVisits: 1 });
    assert.deepEqual((await designerFunnelRows(scope, 60)).furthest, [2, 0, 0, 1, 0, 1]);
    assert.deepEqual(await designerFunnelRows(`${scope}-annan`), { furthest: [0, 0, 0, 0, 0, 0], cartVisits: 0 });
    assert.equal((await designerScopes()).find((row) => row.scope === scope)?.visits, 3);
  });

  test("gamla händelser städas bort, nya blir kvar", async () => {
    const sql = requireDb();
    const ancient = visit();
    await sql`insert into designer_events (visit, scope, step, at) values (${ancient}, ${scope}, 'open', now() - interval '200 days')`;
    assert.ok((await pruneDesignerEvents()) >= 1);
    const left = await sql<{ visit: string }[]>`select visit from designer_events where scope = ${scope} and visit = ${ancient}`;
    assert.equal(left.length, 0);
    assert.equal((await designerFunnelRows(scope, 60)).furthest.reduce((sum, count) => sum + count, 0), 4);
  });
});
