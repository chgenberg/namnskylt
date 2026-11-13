import { readFile } from "node:fs/promises";
import { db } from "../src/lib/db/client";
import { CUSTOMER_SHEETS, parseCustomerSheet, summarizeImport } from "../src/lib/outreach/customer-import";
import { blockExistingResellers, upsertLeads } from "../src/lib/outreach/store";
import { readTable } from "../src/lib/spreadsheet/read-table";

/**
 * Läser kundlistan (OUTREACH_LEADS_FILE) och skriver leads.
 * Utan --write skrivs bara räknare ut — aldrig namn eller adresser.
 */

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_ROWS = 5000;

async function main() {
  const file = process.env.OUTREACH_LEADS_FILE;
  if (!file) throw new Error("Sätt OUTREACH_LEADS_FILE i .env.local till sökvägen till kundlistan.");
  const write = process.argv.includes("--write");

  const bytes = new Uint8Array(await readFile(file));
  const sheets = [];
  for (const sheet of CUSTOMER_SHEETS) {
    const table = await readTable(file, bytes, { sheet, maxBytes: MAX_FILE_BYTES, maxRows: MAX_ROWS });
    sheets.push(parseCustomerSheet(table));
  }
  console.warn(JSON.stringify(summarizeImport(sheets), null, 2));

  if (!write) {
    console.warn("Torrkörning — inget skrevs. Kör med --write för att spara.");
    return;
  }
  const sql = db();
  if (!sql) throw new Error("DATABASE_URL saknas");
  const unique = [...new Map(sheets.flatMap((s) => s.leads).reverse().map((lead) => [lead.email, lead])).values()];
  const result = await upsertLeads(sql, unique);
  const blocked = await blockExistingResellers(sql);
  console.warn(JSON.stringify({ ...result, alreadyResellers: blocked }));
  await sql.end();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
