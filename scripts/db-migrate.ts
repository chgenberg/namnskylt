import { db } from "../src/lib/db/client";
import { migrate } from "../src/lib/db/migrations";

async function main() {
  const sql = db();
  if (!sql) {
    console.warn("DATABASE_URL saknas — hoppar över migreringar.");
    return;
  }
  const applied = await migrate(sql);
  console.warn(applied.length ? `Migrerat: ${applied.join(", ")}` : "Databasen är redan uppdaterad.");
  await sql.end();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
