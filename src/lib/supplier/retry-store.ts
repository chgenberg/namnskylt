import type { Sql, TransactionSql } from "postgres";
import type { FailedDispatch } from "./retry-rules";

type Db = Sql | TransactionSql;

/**
 * Försöket att skicka ordern misslyckades. Ordern ligger kvar och kan skickas
 * igen. Tiden sparas så att schemat vet när nästa försök får göras, och
 * `permanent` säger att felet inte går över av sig självt.
 */
export async function recordDispatchFailure(sql: Db, orderId: string, error: string, permanent: boolean): Promise<void> {
  await sql`
    update orders
       set supplier_error = ${error.slice(0, 500)}, supplier_claimed_at = null,
           supplier_failed_at = now(), supplier_error_permanent = ${permanent}
     where id = ${orderId}`;
}

interface FailedRow {
  order_no: string;
  supplier_attempts: number;
  supplier_failed_at: Date | null;
  supplier_error_permanent: boolean;
}

/**
 * Ordrar vars senaste försök misslyckades och som verkstaden inte har fått.
 * Bara ordrar som redan har provats: en order som väntar utan fel är aldrig
 * med, eftersom ingen har bett om att den ska skickas. Demoordrar och avbrutna
 * ordrar är inte heller med. `tenant` begränsar till en återförsäljares ordrar.
 */
export async function selectFailedDispatches(sql: Db, tenant?: string): Promise<FailedDispatch[]> {
  const rows = await sql<FailedRow[]>`
    select order_no, supplier_attempts, supplier_failed_at, supplier_error_permanent
      from orders
     where supplier_error is not null and supplier_sent_at is null and supplier_attempts > 0
       and not is_demo and status <> 'cancelled'
       ${tenant === undefined ? sql`` : sql`and reseller_id = ${tenant}`}
     order by supplier_failed_at asc nulls last
     limit 500`;
  return rows.map((row) => ({
    orderNo: row.order_no,
    attempts: row.supplier_attempts,
    failedAt: row.supplier_failed_at,
    permanent: row.supplier_error_permanent,
  }));
}
