import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, test } from "node:test";
import postgres, { type Sql, type TransactionSql } from "postgres";
import { createBadgeDocument } from "@/engine";
import { DEFAULT_PRICE_MODEL } from "@/engine/default-price-model";
import type { PriceModel } from "@/engine/price-model";
import { OWNER_TENANT } from "@/lib/tenants/model";
import { listResellerOrders } from "./provision-store";

/** Körs bara mot en riktig databas. Allt sker i en transaktion som rullas tillbaka. */
const url = process.env.DATABASE_URL;
const ROLLBACK = new Error("rulla tillbaka");

/** Kalkylens siffror utan startkostnad: reglerna här prövas var för sig, och startkostnaden har egna tester. */
const M: PriceModel = { ...DEFAULT_PRICE_MODEL, startSek: 0 };

describe("återförsäljarnas ordrar i databasen", { skip: !url }, () => {
  let sql: Sql;
  const run = randomUUID().slice(0, 8);
  const reseller = `prov-test-${run}`;
  /** Tio metallskyltar med nål: 780 kr för återförsäljaren på första trappsteget. */
  const badges = [{ ...createBadgeDocument(["Anna Lind"]), quantity: 10 }];
  /** Modellen ordern sparades med: 25 % provision i stället för dagens 15. */
  const older: PriceModel = { ...M, tiers: M.tiers.map((tier) => ({ ...tier, provisionPercent: 25 })) };

  before(() => {
    sql = postgres(url ?? "", { max: 2, onnotice: () => undefined });
  });
  after(async () => {
    await sql.end();
  });

  async function insertOrder(tx: TransactionSql, input: { tenant: string; status?: string; demo?: boolean; model?: PriceModel | null }) {
    const [customer] = await tx<{ id: string }[]>`
      insert into customers (reseller_id, email, name, company, is_demo)
      values (${input.tenant}, ${`prov-${run}-${randomUUID().slice(0, 6)}@test.invalid`}, 'Test Testsson', 'Testkunden AB', ${input.demo ?? false})
      returning id`;
    const [order] = await tx<{ order_no: string }[]>`
      insert into orders (customer_id, status, badges, price_model, total_sek, total_incl_vat_sek, source, placed_at, is_demo, reseller_id)
      values (${customer?.id ?? ""}, ${input.status ?? "received"}, ${tx.json(JSON.parse(JSON.stringify(badges)))},
              ${input.model === null ? null : tx.json(JSON.parse(JSON.stringify(input.model ?? M)))},
              1300, 1625, 'reseller', now(), ${input.demo ?? false}, ${input.tenant})
      returning order_no`;
    return order?.order_no ?? "";
  }

  test("bara riktiga, inte avbrutna ordrar hos återförsäljare kommer med, räknade med sin sparade modell", async () => {
    await sql
      .begin(async (tx) => {
        const kept = await insertOrder(tx, { tenant: reseller, model: older });
        const withoutModel = await insertOrder(tx, { tenant: reseller, model: null });
        const demo = await insertOrder(tx, { tenant: reseller, demo: true });
        const cancelled = await insertOrder(tx, { tenant: reseller, status: "cancelled" });
        const owners = await insertOrder(tx, { tenant: OWNER_TENANT });

        const all = await listResellerOrders(tx, M);
        const numbers = all.map((row) => row.orderNo);
        assert.ok(numbers.includes(kept) && numbers.includes(withoutModel));
        for (const excluded of [demo, cancelled, owners]) assert.ok(!numbers.includes(excluded), excluded);
        assert.ok(all.every((row) => row.resellerId !== OWNER_TENANT));

        const mine = all.filter((row) => row.resellerId === reseller);
        assert.equal(mine.length, 2);
        const saved = mine.find((row) => row.orderNo === kept);
        assert.deepEqual(saved?.share, { quantity: 10, resellerSek: 780, provisionPercent: 25, provisionSek: 195, supplierSek: 585 });
        assert.equal(saved?.customer, "Testkunden AB");
        assert.equal(saved?.customerSek, 1300);
        // Utan konto visas återförsäljarens id som namn.
        assert.equal(saved?.resellerName, reseller);
        // En rad från före prismodellen räknas med dagens: 15 %.
        assert.equal(mine.find((row) => row.orderNo === withoutModel)?.share.provisionSek, 117);
        throw ROLLBACK;
      })
      .catch((error: unknown) => {
        if (error !== ROLLBACK) throw error;
      });
    const [left] = await sql<{ count: number }[]>`select count(*)::int as count from orders where reseller_id = ${reseller}`;
    assert.equal(left?.count, 0);
  });
});
