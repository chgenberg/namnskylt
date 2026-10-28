import { db } from "../src/lib/db/client";
import { migrate } from "../src/lib/db/migrations";
import { insertDemoData, removeDemoData } from "../src/lib/orders/demo-data";

/**
 * Demodata lokalt. `--reset` tar bort tidigare demodata först; riktiga
 * ordrar rörs aldrig. I produktionen används knappen i adminpanelen.
 */
async function main() {
  const sql = db();
  if (!sql) throw new Error("DATABASE_URL saknas");
  await migrate(sql);
  if (process.argv.includes("--reset")) console.warn(`Tog bort ${await removeDemoData(sql, "namnskylt")} demoordrar.`);
  console.warn(`Lade in ${await insertDemoData(sql, "namnskylt")} demoordrar.`);
  await sql.end();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
