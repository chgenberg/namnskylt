import { requireDb } from "../src/lib/db/client";
import { groupByWebsite } from "../src/lib/outreach/demo-source";
import { WAVES, type Wave } from "../src/lib/outreach/model";
import { prepareDemo, type PersonaOutcome, type PrepareOptions } from "../src/lib/outreach/prepare-demo";
import { getLead, leadsNeedingDemo, type LeadRow } from "../src/lib/outreach/store";

/**
 * Bygger demobutik och bilder för leads i en eller flera vågor.
 *   pnpm outreach:prepare --wave A [--wave B] [--limit 20] [--force]
 *   pnpm outreach:prepare --lead <uuid>
 * Personbilden görs bara om den saknas: --no-persona hoppar över den,
 * --redo-persona gör en ny, --persona-quality high ger skarpare logga (dyrare).
 * Avbryts den kan den köras igen: färdiga leads hoppas över.
 */

const CONCURRENCY = 2;
const DEFAULT_LIMIT = 50;

function personaOptions(argv: string[]): PrepareOptions {
  const qualityIndex = argv.indexOf("--persona-quality");
  const quality = qualityIndex >= 0 ? argv[qualityIndex + 1] : "medium";
  if (quality !== "medium" && quality !== "high") throw new Error("--persona-quality är medium eller high");
  return {
    persona: argv.includes("--no-persona") ? "skip" : argv.includes("--redo-persona") ? "redo" : "keep",
    personaQuality: quality,
  };
}

function args() {
  const argv = process.argv.slice(2);
  const leadIndex = argv.indexOf("--lead");
  if (leadIndex >= 0) {
    const id = argv[leadIndex + 1] ?? "";
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error("--lead kräver ett uuid");
    return { lead: id, waves: [] as Wave[], limit: 1, force: true, persona: personaOptions(argv) };
  }
  const waves = argv.flatMap((a, i) => (a === "--wave" && argv[i + 1] ? [argv[i + 1]] : []));
  const unknown = waves.filter((w) => !WAVES.includes(w as Wave));
  if (!waves.length || unknown.length) throw new Error(`Ange --wave med någon av ${WAVES.join(", ")}`);
  const limitIndex = argv.indexOf("--limit");
  const limit = limitIndex >= 0 ? Number(argv[limitIndex + 1]) : DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1) throw new Error("--limit måste vara ett positivt heltal");
  return { lead: null, waves: waves as Wave[], limit, force: argv.includes("--force"), persona: personaOptions(argv) };
}

async function main() {
  const { lead: leadId, waves, limit, force, persona } = args();
  const sql = requireDb();
  const single = leadId ? await getLead(sql, leadId) : null;
  if (leadId && !single) throw new Error("Leadet finns inte");
  const leads = single ? [single] : await leadsNeedingDemo(sql, { waves, limit, force });
  console.warn(`${leads.length} leads att förbereda (${waves.join(", ")})`);

  const tally = { existing: 0, built: 0, shell: 0, logo: 0, textOnly: 0, failed: 0 };
  const personas: Record<PersonaOutcome, number> = { created: 0, kept: 0, skipped: 0, failed: 0, "no-ai": 0 };
  async function prepare(lead: LeadRow) {
    try {
      const outcome = await prepareDemo(lead, persona);
      if (!outcome.ok) {
        tally.failed++;
        console.warn(`  ${lead.id}: ${outcome.reason}`);
        return;
      }
      tally[outcome.source]++;
      personas[outcome.persona]++;
      if (outcome.logoStatus === "logo") tally.logo++;
      else tally.textOnly++;
    } catch (error) {
      tally.failed++;
      console.warn(`  ${lead.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const groups = groupByWebsite(leads);
  let next = 0;
  async function worker() {
    for (let group = groups[next++]; group; group = groups[next++]) {
      for (const lead of group) await prepare(lead);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.warn(JSON.stringify({ ...tally, personas }));
  await sql.end();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
