import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { PUBLIC_PATHS, robotsFor, sitemapFor } from "./crawl";

const ORIGIN = "https://www.namnskylt.com";

describe("sökmotorerna och sajtspärren", () => {
  it("släpper inte in någon sökmotor så länge sajten är låst", () => {
    assert.deepEqual(robotsFor(true, ORIGIN), { rules: { userAgent: "*", disallow: "/" } });
    assert.deepEqual(sitemapFor(true, ORIGIN), []);
  });

  it("öppnar de publika sidorna och pekar på sitemapen när spärren är borta", () => {
    const robots = robotsFor(false, ORIGIN);
    assert.equal(robots.rules.allow, "/");
    assert.equal(robots.sitemap, "https://www.namnskylt.com/sitemap.xml");
    for (const path of ["/for/", "/avregistrera/", "/utskick/", "/aterforsaljare/", "/admin", "/api/"]) {
      assert.ok((robots.rules.disallow as string[]).includes(path), path);
    }
    const urls = sitemapFor(false, ORIGIN).map((entry) => entry.url);
    assert.deepEqual(urls, [
      "https://www.namnskylt.com",
      "https://www.namnskylt.com/skapa",
      "https://www.namnskylt.com/foretag",
      "https://www.namnskylt.com/inspiration",
      "https://www.namnskylt.com/villkor",
      "https://www.namnskylt.com/integritet",
    ]);
  });

  it("listar aldrig butiker, hemliga länkar, panelen eller något robots stänger ute", () => {
    const disallowed = robotsFor(false, ORIGIN).rules.disallow as string[];
    for (const path of PUBLIC_PATHS) {
      assert.ok(!/^\/(butik|offert|korrektur|order|betalning|inbaddning|forhandsvisning)(\/|$)/.test(path), path);
      // `/for/` stänger ute de personliga länkarna, inte `/foretag`.
      const blocks = (prefix: string) => path === prefix.replace(/\/$/, "") || path.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`);
      assert.ok(!disallowed.some(blocks), path);
    }
  });

  it("listar bara sidor som finns", () => {
    for (const path of PUBLIC_PATHS) {
      assert.ok(existsSync(join(process.cwd(), "src/app", path, "page.tsx")), `src/app${path}/page.tsx saknas`);
    }
  });
});
