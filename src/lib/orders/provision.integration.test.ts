import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, test } from "node:test";
import postgres, { type Sql, type TransactionSql } from "postgres";
import { createBadgeDocument, NO_SHIPPING } from "@/engine";
import { DEFAULT_PRICE_MODEL } from "@/engine/default-price-model";
import type { PriceModel } from "@/engine/price-model";
import { OWNER_TENANT } from "@/lib/tenants/model";
import { DIRECT_SELLER_NAME } from "./provision";
import { listResellerOrders } from "./provision-store";

/** Körs bara mot en riktig databas. Allt sker i en transaktion som rullas tillbaka. */
const url = process.env.DATABASE_URL;
const ROLLBACK = new Error("rulla tillbaka");

/** Kalkylens siffror utan startkostnad: reglerna här prövas var för sig, och startkostnaden har egna tester. */
const M: PriceModel = { ...DEFAULT_PRICE_MODEL, startSek: 0, shipping: NO_SHIPPING };

describe("ordrarna verkstaden fakturerar, i databasen", { skip: !url }, () => {
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

  async function insertOrder(tx: TransactionSql, input: { tenant: string; status?: string; demo?: boolean; model?: PriceModel | null; paidByCard?: boolean }) {
    const [customer] = await tx<{ id: string }[]>`
      insert into customers (reseller_id, email, name, company, is_demo)
      values (${input.tenant}, ${`prov-${run}-${randomUUID().slice(0, 6)}@test.invalid`}, 'Test Testsson', 'Testkunden AB', ${input.demo ?? false})
      returning id`;
    const [order] = await tx<{ order_no: string }[]>`
      insert into orders (customer_id, status, badges, price_model, total_sek, total_incl_vat_sek, source, placed_at, is_demo, reseller_id, payment)
      values (${customer?.id ?? ""}, ${input.status ?? "received"}, ${tx.json(JSON.parse(JSON.stringify(badges)))},
              ${input.model === null ? null : tx.json(JSON.parse(JSON.stringify(input.model ?? M)))},
              1300, 1625, 'reseller', now(), ${input.demo ?? false}, ${input.tenant},
              ${input.paidByCard ? tx.json({ method: "card" }) : null})
      returning order_no`;
    return order?.order_no ?? "";
  }

  test("riktiga, inte avbrutna ordrar kommer med, räknade med sin sparade modell: återförsäljarnas och direktordrarna", async () => {
    await sql
      .begin(async (tx) => {
        const kept = await insertOrder(tx, { tenant: reseller, model: older });
        const withoutModel = await insertOrder(tx, { tenant: reseller, model: null });
        const demo = await insertOrder(tx, { tenant: reseller, demo: true });
        const cancelled = await insertOrder(tx, { tenant: reseller, status: "cancelled" });
        const direct = await insertOrder(tx, { tenant: OWNER_TENANT });
        const directDemo = await insertOrder(tx, { tenant: OWNER_TENANT, demo: true });
        const directByCard = await insertOrder(tx, { tenant: OWNER_TENANT, paidByCard: true });

        const all = await listResellerOrders(tx, M);
        const numbers = all.map((row) => row.orderNo);
        assert.ok(numbers.includes(kept) && numbers.includes(withoutModel) && numbers.includes(direct));
        // En order betald med kort fakturerar verkstaden inte, så den hör inte till underlaget.
        for (const excluded of [demo, cancelled, directDemo, directByCard]) assert.ok(!numbers.includes(excluded), excluded);

        // Direktordern hos namnskylt.com: verkstaden fakturerar kunden 1 300 kr, och plattformens del är marginalen.
        const own = all.find((row) => row.orderNo === direct);
        assert.equal(own?.resellerId, OWNER_TENANT);
        assert.equal(own?.resellerName, DIRECT_SELLER_NAME);
        assert.deepEqual(own?.share, {
          quantity: 10,
          resellerSek: 1300,
          shippingSek: 0,
          provisionPercent: 40,
          provisionSek: 520,
          supplierSek: 780,
        });

        const mine = all.filter((row) => row.resellerId === reseller);
        assert.equal(mine.length, 2);
        const saved = mine.find((row) => row.orderNo === kept);
        assert.deepEqual(saved?.share, {
          quantity: 10,
          resellerSek: 780,
          shippingSek: 0,
          provisionPercent: 25,
          provisionSek: 195,
          supplierSek: 585,
        });
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
