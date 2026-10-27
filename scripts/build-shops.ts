/**
 * Bygger demobutiker i klump ur en lista med hemsidor.
 *
 *   tsx --conditions=react-server scripts/build-shops.ts <sajter.json> <resultat.json> [parallellt]
 *
 * `sajter.json` = [{ domain, url, name }]. Resultatet sparas efter varje butik,
 * så en avbruten körning fortsätter där den slutade.
 */
import { readFile, writeFile } from "node:fs/promises";
import { buildShop } from "@/lib/shops/build";

interface Site {
  domain: string;
  url: string;
  name: string;
}

type Result =
  | { domain: string; ok: true; slug: string; name: string; logo: boolean; font: string | null; primary: string; seconds: number }
  | { domain: string; ok: false; error: string; seconds: number };

const BUILD_TIMEOUT_MS = 75_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("tidsgräns")), ms)),
  ]);
}

async function main() {
  const [sitesPath, resultsPath, parallelArg] = process.argv.slice(2);
  if (!sitesPath || !resultsPath) throw new Error("Ange sajter.json och resultat.json");
  const sites = JSON.parse(await readFile(sitesPath, "utf8")) as Site[];
  const results = new Map<string, Result>(
    (JSON.parse(await readFile(resultsPath, "utf8").catch(() => "[]")) as Result[]).map((r) => [r.domain, r]),
  );
  const queue = sites.filter((site) => !results.get(site.domain)?.ok);
  const parallel = Math.max(1, Math.min(6, Number(parallelArg) || 4));
  console.log(`${queue.length} kvar av ${sites.length}, ${parallel} parallellt`);

  let saving = Promise.resolve();
  const save = () => {
    saving = saving.then(() => writeFile(resultsPath, JSON.stringify([...results.values()], null, 1)));
    return saving;
  };

  let next = 0;
  let done = 0;
  async function worker() {
    for (;;) {
      const site = queue[next++];
      if (!site) return;
      const started = Date.now();
      const seconds = () => Math.round((Date.now() - started) / 100) / 10;
      try {
        const shop = await withTimeout(buildShop(site.url, { name: site.name }), BUILD_TIMEOUT_MS);
        results.set(site.domain, {
          domain: site.domain,
          ok: true,
          slug: shop.slug,
          name: shop.profile.name,
          logo: shop.profile.logo !== null,
          font: shop.font.google ? shop.font.family : null,
          primary: shop.profile.primaryColor,
          seconds: seconds(),
        });
        console.log(`${++done}/${queue.length} ok   ${site.domain} → /butik/${shop.slug}${shop.profile.logo ? "" : " (ingen logga)"}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        results.set(site.domain, { domain: site.domain, ok: false, error: message.slice(0, 200), seconds: seconds() });
        console.log(`${++done}/${queue.length} fel  ${site.domain}: ${message.slice(0, 120)}`);
      }
      await save();
    }
  }

  await Promise.all(Array.from({ length: parallel }, worker));
  await saving;
  const all = [...results.values()];
  console.log(`klart: ${all.filter((r) => r.ok).length} butiker, ${all.filter((r) => !r.ok).length} fel`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
