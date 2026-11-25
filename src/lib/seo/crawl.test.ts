import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { TOPIC_EXAMPLES } from "@/lib/topics/examples";
import { TOPICS } from "@/lib/topics/model";
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
      "https://www.namnskylt.com/om-oss",
      "https://www.namnskylt.com/kontakt",
      "https://www.namnskylt.com/villkor",
      "https://www.namnskylt.com/integritet",
      "https://www.namnskylt.com/namnskyltar",
      ...TOPICS.map((topic) => `https://www.namnskylt.com/namnskyltar/${topic.slug}`),
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
      // Sidorna om namnskyltar ritas av en enda sida, `namnskyltar/[slug]`, med en exempelskylt var.
      const topic = TOPICS.find((item) => path === `/namnskyltar/${item.slug}`);
      const file = topic ? "namnskyltar/[slug]" : path;
      assert.ok(existsSync(join(process.cwd(), "src/app", file, "page.tsx")), `src/app${file}/page.tsx saknas`);
      if (topic) assert.ok(TOPIC_EXAMPLES[topic.slug], `${topic.slug} saknar exempelskylt`);
    }
  });
});
