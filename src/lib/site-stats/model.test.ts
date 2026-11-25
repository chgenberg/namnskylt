import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { cleanPath, deviceOf, isBotAgent, referrerHost, sourceOf, stockholmDay, visitorOf } from "./model";

const CHROME = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";
const IPAD = "Mozilla/5.0 (iPad; CPU OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/604.1";
const ANDROID_TABLET = "Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";

describe("besöksstatistik utan kakor", () => {
  test("robotar och skript räknas inte", () => {
    for (const ua of [null, "", "curl/8.1", "Googlebot/2.1 (+http://www.google.com/bot.html)", "facebookexternalhit/1.1", "Mozilla/5.0 HeadlessChrome/131.0", "python-requests/2.31"]) {
      assert.equal(isBotAgent(ua), true, String(ua));
    }
    assert.equal(isBotAgent(CHROME), false);
  });

  test("dator, telefon och surfplatta", () => {
    assert.equal(deviceOf(CHROME), "dator");
    assert.equal(deviceOf(IPHONE), "telefon");
    assert.equal(deviceOf(IPAD), "surfplatta");
    assert.equal(deviceOf(ANDROID_TABLET), "surfplatta");
  });

  test("panelen, API:erna och butikerna räknas inte", () => {
    for (const path of ["/admin", "/admin/ordrar", "/api/site-visits", "/verkstad", "/butik/profilhuset", "/butik/profilhuset/skapa", "x", ""]) {
      assert.equal(cleanPath(path), null, path);
    }
  });

  test("hemliga koder sparas aldrig", () => {
    assert.equal(cleanPath("/offert/abc123def456"), "/offert/[kod]");
    assert.equal(cleanPath("/order/0f9e8d7c6b5a/logga.png"), "/order/[kod]/logga.png");
    assert.equal(cleanPath("/f/abcdef123456"), "/f/[kod]");
    assert.equal(cleanPath("/konto/losenord/hemlig"), "/konto/losenord/[kod]");
    assert.equal(cleanPath("/aterforsaljare/konto/hemlig"), "/aterforsaljare/konto/[kod]");
    assert.equal(cleanPath("/aterforsaljare/inbjudan-kod"), "/aterforsaljare/[kod]");
    assert.equal(cleanPath("/avregistrera/v1.u.abc"), "/avregistrera/[kod]");
    assert.equal(cleanPath("/aterforsaljare/ansok"), "/aterforsaljare/ansok");
    assert.equal(cleanPath("/aterforsaljare"), "/aterforsaljare");
  });

  test("frågor, ankare och snedstreck sist tas bort", () => {
    assert.equal(cleanPath("/demo?k=v1.l.hemlig#film"), "/demo");
    assert.equal(cleanPath("/skapa/"), "/skapa");
    assert.equal(cleanPath("/"), "/");
  });

  test("varifrån: andra sajter, inte sajten själv", () => {
    const own = ["namnskylt.com", "localhost"];
    assert.equal(referrerHost("https://www.google.com/search?q=namnskylt", own), "google.com");
    assert.equal(referrerHost("https://www.namnskylt.com/om-oss", own), null);
    assert.equal(referrerHost("http://localhost:3123/", own), null);
    assert.equal(referrerHost("inte en adress", own), null);
    assert.equal(referrerHost("", own), null);
  });

  test("utskicket och kampanjer", () => {
    assert.equal(sourceOf("?k=v1.l.abc"), "utskick");
    assert.equal(sourceOf("?utm_source=LinkedIn&utm_medium=social"), "linkedin");
    assert.equal(sourceOf("utm_source=<script>"), "script");
    assert.equal(sourceOf(""), null);
  });

  test("koden byts varje dygn och avslöjar inte IP-adressen", () => {
    const a = visitorOf("203.0.113.7", CHROME, "2026-11-25", "hemlighet");
    assert.equal(a, visitorOf("203.0.113.7", CHROME, "2026-11-25", "hemlighet"));
    assert.notEqual(a, visitorOf("203.0.113.7", CHROME, "2026-11-26", "hemlighet"));
    assert.notEqual(a, visitorOf("203.0.113.8", CHROME, "2026-11-25", "hemlighet"));
    assert.equal(a.length, 16);
    assert.ok(!a.includes("203"));
  });

  test("dagen räknas i svensk tid", () => {
    assert.equal(stockholmDay(new Date("2026-11-25T23:30:00Z")), "2026-11-26");
    assert.equal(stockholmDay(new Date("2026-11-25T12:00:00Z")), "2026-11-25");
  });
});
