import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { after, before, describe, test } from "node:test";
import postgres, { type Sql } from "postgres";
import { insertLogoImage, selectLogoImages } from "./store";

/** Körs bara mot en riktig databas. Allt sker i en transaktion som rullas tillbaka. */
const url = process.env.DATABASE_URL;
const ROLLBACK = new Error("rulla tillbaka");

describe("loggornas bilder i databasen", { skip: !url }, () => {
  let sql: Sql;
  before(() => {
    sql = postgres(url ?? "", { max: 2, onnotice: () => undefined });
  });
  after(async () => {
    await sql.end();
  });

  test("en bild sparas en gång under sitt id och läses tillbaka byte för byte", async () => {
    const png = randomBytes(2048);
    const id = createHash("sha256").update(png).digest("hex");
    const other = createHash("sha256").update("finns inte").digest("hex");
    await sql
      .begin(async (tx) => {
        await insertLogoImage(tx, id, png);
        // Samma bild igen är ingen ny rad och inget fel.
        await insertLogoImage(tx, id, png);
        const [count] = await tx<{ n: number }[]>`select count(*)::int as n from logo_images where id = ${id}`;
        assert.equal(count?.n, 1);

        const found = await selectLogoImages(tx, [id, other]);
        assert.deepEqual([...found.keys()], [id]);
        assert.ok(found.get(id)?.equals(png));
        assert.equal((await selectLogoImages(tx, [])).size, 0);
        throw ROLLBACK;
      })
      .catch((error) => {
        if (error !== ROLLBACK) throw error;
      });
  });

  test("ett id som inte är en SHA-256 stoppas av databasen", async () => {
    await assert.rejects(
      sql.begin(async (tx) => {
        await insertLogoImage(tx, "../admin", randomBytes(8));
      }),
    );
  });
});
