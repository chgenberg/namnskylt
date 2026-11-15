import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { after, before, describe, test } from "node:test";
import postgres, { type Sql, type TransactionSql } from "postgres";
import { createBadgeDocument, logoImageRef, type BadgeDocument } from "@/engine";
import { requireDb } from "@/lib/db/client";
import { getLogoOriginal, logoOriginalsOf, storeLogoOriginal, withKnownLogoOriginals } from "./originals";
import { withStoredLogoImages } from "./repository";
import {
  deleteUnusedLogoRows,
  insertLogoImage,
  insertLogoOriginal,
  selectLogoImages,
  selectLogoOriginal,
  selectLogoOriginalInfo,
} from "./store";

/** Körs bara mot en riktig databas med migreringen `024_payments_erasure_originals_errors`. */
const url = process.env.DATABASE_URL;
const ROLLBACK = new Error("rulla tillbaka");

const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
/** En fil som känns igen som PNG, med slumpat innehåll så att id:t är unikt för testet. */
const pngFile = () => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), randomBytes(512)]);
const svgFile = () => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg"><!-- ${randomUUID()} --><path d="M0 0L1 1"/></svg>`);

const LOGO = { d: "M0 0L10 0L10 10L0 10Z", viewWidth: 10, viewHeight: 10, placement: "left" as const, heightMm: 12 };
const badgeWith = (logo: Partial<NonNullable<BadgeDocument["logo"]>>): BadgeDocument => ({
  ...createBadgeDocument(["Anna Lind"]),
  logo: { ...LOGO, ...logo },
});

/** Kör `work` i en transaktion som alltid rullas tillbaka. */
async function rolledBack(sql: Sql, work: (tx: TransactionSql) => Promise<void>): Promise<void> {
  await sql
    .begin(async (tx) => {
      await work(tx);
      throw ROLLBACK;
    })
    .catch((error) => {
      if (error !== ROLLBACK) throw error;
    });
}

describe("loggornas originalfiler i databasen", { skip: !url }, () => {
  let sql: Sql;
  before(() => {
    sql = postgres(url ?? "", { max: 2, onnotice: () => undefined });
  });
  after(async () => {
    await sql.end();
  });

  test("en fil sparas en gång under sitt id och läses tillbaka byte för byte", async () => {
    const bytes = svgFile();
    const id = sha(bytes);
    await rolledBack(sql, async (tx) => {
      await insertLogoOriginal(tx, { id, mime: "image/svg+xml", name: "logga.svg", bytes });
      // Samma fil igen är ingen ny rad och inget fel, även med ett annat namn.
      await insertLogoOriginal(tx, { id, mime: "image/svg+xml", name: "annat namn.svg", bytes });
      const [count] = await tx<{ n: number }[]>`select count(*)::int as n from logo_originals where id = ${id}`;
      assert.equal(count?.n, 1);
      const found = await selectLogoOriginal(tx, id);
      assert.ok(found?.bytes.equals(bytes));
      assert.equal(found?.mime, "image/svg+xml");
      assert.equal(found?.name, "logga.svg");
      assert.equal(await selectLogoOriginal(tx, sha(Buffer.from("finns inte"))), null);
      assert.deepEqual(await selectLogoOriginalInfo(tx, [id, sha(Buffer.from("finns inte"))]), [
        { id, mime: "image/svg+xml", name: "logga.svg", sizeBytes: bytes.length },
      ]);
      assert.deepEqual(await selectLogoOriginalInfo(tx, []), []);
    });
  });

  test("ett id som inte är en SHA-256 stoppas av databasen", async () => {
    await assert.rejects(
      sql.begin(async (tx) => {
        await insertLogoOriginal(tx, { id: "../admin", mime: "image/png", name: null, bytes: randomBytes(8) });
      }),
    );
  });

  test("städningen tar bort gamla filer som ingen skylt pekar på och behåller alla andra", async () => {
    await rolledBack(sql, async (tx) => {
      const image = (label: string) => {
        const bytes = randomBytes(256);
        return { label, id: sha(bytes), bytes };
      };
      const images = {
        oldUnused: image("gammal, oanvänd"),
        oldInOrder: image("gammal, i en order"),
        oldInQuote: image("gammal, i en offert"),
        oldInCheckout: image("gammal, i en betalning som väntar"),
        oldInSettings: image("gammal, nämnd i en inställning"),
        fresh: image("ny, oanvänd"),
      };
      const originals = {
        oldUnused: image("gammal, oanvänd"),
        oldInOrder: image("gammal, i en order"),
        oldInDesign: image("gammal, i en mall"),
        fresh: image("ny, oanvänd"),
      };
      for (const file of Object.values(images)) await insertLogoImage(tx, file.id, file.bytes);
      for (const file of Object.values(originals)) {
        await insertLogoOriginal(tx, { id: file.id, mime: "image/png", name: "logga.png", bytes: file.bytes });
      }
      const old = [images.oldUnused, images.oldInOrder, images.oldInQuote, images.oldInCheckout, images.oldInSettings].map((f) => f.id);
      const oldOriginals = [originals.oldUnused, originals.oldInOrder, originals.oldInDesign].map((f) => f.id);
      await tx`update logo_images set created_at = now() - interval '45 days' where id in ${tx(old)}`;
      await tx`update logo_originals set created_at = now() - interval '45 days' where id in ${tx(oldOriginals)}`;

      // Skyltarna som pekar på filerna, sparade på de ställen skyltar sparas.
      const tenant = `logo-test-${randomUUID().slice(0, 8)}`;
      const [customer] = await tx<{ id: string }[]>`
        insert into customers (reseller_id, email, name) values (${tenant}, ${`${tenant}@example.se`}, 'Testkund') returning id`;
      assert.ok(customer);
      const ordered = [badgeWith({ image: { src: logoImageRef(images.oldInOrder.id) }, originalId: originals.oldInOrder.id })];
      await tx`
        insert into orders (customer_id, status, badges, total_sek, total_incl_vat_sek, reseller_id)
        values (${customer.id}, 'received', ${tx.json(ordered as never)}, 100, 125, ${tenant})`;
      const quoted = [badgeWith({ image: { src: logoImageRef(images.oldInQuote.id) } })];
      await tx`
        insert into quotes (customer_id, badges, total_sek, total_incl_vat_sek, valid_until, token, reseller_id)
        values (${customer.id}, ${tx.json(quoted as never)}, 100, 125, current_date + 30, ${`test-${randomUUID()}`}, ${tenant})`;
      await tx`
        insert into designs (customer_id, name, doc)
        values (${customer.id}, 'Mall', ${tx.json(badgeWith({ originalId: originals.oldInDesign.id }) as never)})`;
      const waiting = { badges: [badgeWith({ image: { src: logoImageRef(images.oldInCheckout.id) } })] };
      await tx`
        insert into checkouts (payload, price_model, amount_ore)
        values (${tx.json(waiting as never)}, ${tx.json({})}, 12500)`;
      await tx`
        insert into settings (key, value) values (${`test:${tenant}`}, ${tx.json({ logo: logoImageRef(images.oldInSettings.id) })})`;

      const removed = await deleteUnusedLogoRows(tx, 30);
      // Databasen kan ha fler gamla, oanvända filer än testets egna.
      assert.ok(removed.images >= 1, "ingen bild togs bort");
      assert.ok(removed.originals >= 1, "ingen originalfil togs bort");

      const leftImages = await selectLogoImages(tx, Object.values(images).map((f) => f.id));
      const leftOriginals = new Set((await selectLogoOriginalInfo(tx, Object.values(originals).map((f) => f.id))).map((f) => f.id));
      for (const [key, file] of Object.entries(images)) {
        assert.equal(leftImages.has(file.id), key !== "oldUnused", `bilden "${file.label}"`);
      }
      for (const [key, file] of Object.entries(originals)) {
        assert.equal(leftOriginals.has(file.id), key !== "oldUnused", `originalfilen "${file.label}"`);
      }

      // En kortare gräns än ett dygn finns inte: dagens filer ligger alltid kvar.
      await deleteUnusedLogoRows(tx, 0);
      assert.ok((await selectLogoImages(tx, [images.fresh.id])).has(images.fresh.id));
      assert.ok(await selectLogoOriginal(tx, originals.fresh.id));

      // När ordern är borta pekar ingen på dess filer längre.
      await tx`delete from orders where reseller_id = ${tenant}`;
      await deleteUnusedLogoRows(tx, 30);
      assert.equal((await selectLogoImages(tx, [images.oldInOrder.id])).size, 0);
      assert.equal(await selectLogoOriginal(tx, originals.oldInOrder.id), null);
      assert.ok(await selectLogoOriginal(tx, originals.oldInDesign.id));
    });
  });
});

describe("originalfilen från uppladdning till order", { skip: !url }, () => {
  const stored: string[] = [];

  after(async () => {
    const sql = requireDb();
    if (stored.length > 0) await sql`delete from logo_originals where id in ${sql(stored)}`;
    await sql.end();
  });

  test("filen sparas under sin SHA-256 med typen läst ur innehållet och ett rensat namn", async () => {
    const bytes = svgFile();
    const id = await storeLogoOriginal(bytes, "C:\\Skrivbord\\Logga AB.png");
    assert.equal(id, sha(bytes));
    if (id) stored.push(id);
    // Samma fil igen ger samma id.
    assert.equal(await storeLogoOriginal(bytes, "annat.svg"), id);
    const file = await getLogoOriginal(id ?? "");
    assert.ok(file?.bytes.equals(bytes));
    // Namnet påstod PNG; innehållet är en SVG.
    assert.equal(file?.mime, "image/svg+xml");
    assert.equal(file?.name, "Logga AB.png");
  });

  test("tomma, för stora och okända filer sparas inte", async () => {
    assert.equal(await storeLogoOriginal(new Uint8Array()), null);
    assert.equal(await storeLogoOriginal(Buffer.from("<html><script>alert(1)</script></html>"), "logga.svg"), null);
    assert.equal(await storeLogoOriginal(Buffer.concat([pngFile(), Buffer.alloc(10 * 1024 * 1024)]), "stor.png"), null);
    assert.equal(await getLogoOriginal("../admin"), null);
    assert.equal(await getLogoOriginal(sha(randomBytes(16))), null);
  });

  test("en order behåller hänvisningen till en fil som finns och tappar en som inte finns", async () => {
    const bytes = pngFile();
    const id = await storeLogoOriginal(bytes, "logga.png");
    assert.ok(id);
    stored.push(id);
    const missing = sha(randomBytes(32));
    const badges = [badgeWith({ originalId: id }), badgeWith({ originalId: missing }), badgeWith({}), createBadgeDocument(["Bo Ek"])];

    assert.deepEqual(await logoOriginalsOf(badges), [{ id, mime: "image/png", name: "logga.png", sizeBytes: bytes.length }]);
    for (const save of [withKnownLogoOriginals, withStoredLogoImages]) {
      const saved = await save(badges);
      assert.equal(saved[0]?.logo?.originalId, id);
      assert.equal(saved[1]?.logo?.originalId, undefined);
      // Loggan själv står kvar, och skyltar utan hänvisning är orörda.
      assert.equal(saved[1]?.logo?.d, LOGO.d);
      assert.deepEqual(saved[2], badges[2]);
      assert.deepEqual(saved[3], badges[3]);
    }
  });
});
