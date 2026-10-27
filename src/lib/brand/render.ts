import "server-only";
import type { Browser, Page } from "playwright-core";
import { collectPage, dismissOverlays, LOGO_ATTRIBUTE, type CollectedLogo, type CollectedPage } from "./page-collect";
import { allowBrowserRequest, isPublicHost } from "./request-guard";
import { FetchBlockedError, parsePublicUrl, withWww } from "./url";

export class BrowserUnavailableError extends Error {}

export interface RenderedLogo extends CollectedLogo {
  /** Elementet som det ser ut på sidan, med transparent sidbakgrund. */
  shot: Buffer | null;
}

export interface RenderedSite {
  url: string;
  host: string;
  pages: string[];
  home: CollectedPage;
  /** Undersidornas text och rubriker, för branschen. */
  extra: Pick<CollectedPage, "headings" | "text">[];
  /** Överkanten av startsidan i CSS-pixlar. */
  screenshot: Buffer | null;
  logos: RenderedLogo[];
}

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";
const LAUNCH_ARGS = ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--force-webrtc-ip-handling-policy=disable_non_proxied_udp"];
/** Varje sida drar några hundra MB; fler samtidigt får vänta eller läsas utan webbläsare. */
const MAX_CONCURRENT_PAGES = 2;
const IDLE_CLOSE_MS = 90_000;
/** Saknas Chromium försöker vi inte starta om vid varje hämtning. */
const LAUNCH_RETRY_MS = 10 * 60_000;
const MAX_SUBPAGES = 2;
const SUBPAGE_MIN_REMAINING_MS = 9_000;
/** Sidan kan inte nå WebRTC eller skicka `__name`-anrop från verktygens transpilering. */
const INIT_SCRIPT = "globalThis.__name ??= (f) => f; try { delete window.RTCPeerConnection; delete window.webkitRTCPeerConnection; } catch {}";

let browser: Promise<Browser> | null = null;
let launchFailedAt = 0;
let active = 0;
const waiting: (() => void)[] = [];
let idleTimer: ReturnType<typeof setTimeout> | null = null;

async function launch(): Promise<Browser> {
  const { chromium } = await import("playwright-core");
  const executablePath = process.env.CHROMIUM_PATH;
  if (executablePath) return chromium.launch({ executablePath, args: LAUNCH_ARGS });
  try {
    return await chromium.launch({ args: LAUNCH_ARGS });
  } catch {
    return chromium.launch({ channel: "chrome", args: LAUNCH_ARGS });
  }
}

function sharedBrowser(): Promise<Browser> {
  if (!browser && Date.now() - launchFailedAt < LAUNCH_RETRY_MS) {
    return Promise.reject(new BrowserUnavailableError("Chromium saknas"));
  }
  browser ??= launch().then(
    (b) => {
      b.on("disconnected", () => {
        browser = null;
      });
      return b;
    },
    (error: unknown) => {
      browser = null;
      launchFailedAt = Date.now();
      throw new BrowserUnavailableError(error instanceof Error ? error.message : "Chromium startade inte");
    },
  );
  return browser;
}

function acquire(waitMs: number): Promise<void> {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = null;
  if (active < MAX_CONCURRENT_PAGES) {
    active++;
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const grant = () => {
      clearTimeout(timer);
      active++;
      resolve();
    };
    const timer = setTimeout(() => {
      waiting.splice(waiting.indexOf(grant), 1);
      reject(new BrowserUnavailableError("Webbläsaren är upptagen"));
    }, waitMs);
    waiting.push(grant);
  });
}

function release() {
  active--;
  const next = waiting.shift();
  if (next) return next();
  if (active === 0) {
    idleTimer = setTimeout(() => {
      const closing = browser;
      browser = null;
      void closing?.then((b) => b.close()).catch(() => {});
    }, IDLE_CLOSE_MS);
  }
}

async function settle(page: Page, idleMs: number) {
  await page.waitForLoadState("networkidle", { timeout: idleMs }).catch(() => {});
  // Lata bilder och sidhuvuden som byggs vid skroll.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 3)).catch(() => {});
  await page.waitForTimeout(500);
  await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
  await page.waitForTimeout(250);
}

async function logoShot(page: Page, index: number): Promise<Buffer | null> {
  return page
    .locator(`[${LOGO_ATTRIBUTE}="${index}"]`)
    .first()
    .screenshot({ omitBackground: true, timeout: 4000, animations: "disabled" })
    .catch(() => null);
}

/** Renderar sidan i en riktig webbläsare och läser det en besökare ser. */
export async function renderSite(rawUrl: string, deadlineMs: number): Promise<RenderedSite> {
  const deadline = Date.now() + deadlineMs;
  const start = parsePublicUrl(rawUrl);
  if (!(await isPublicHost(start.hostname))) throw new FetchBlockedError("Adressen är inte publik");

  await acquire(Math.min(10_000, deadlineMs / 2));
  try {
    const context = await (await sharedBrowser()).newContext({
      viewport: { width: 1440, height: 900 },
      // Loggornas skärmdumpar blir skarpare att spåra.
      deviceScaleFactor: 3,
      locale: "sv-SE",
      userAgent: USER_AGENT,
      serviceWorkers: "block",
      acceptDownloads: false,
    });
    try {
      await context.addInitScript({ content: INIT_SCRIPT });
      await context.route("**/*", async (route) => {
        const request = route.request();
        return (await allowBrowserRequest(request.url(), request.resourceType())) ? route.continue() : route.abort();
      });
      await context.routeWebSocket(/.*/, (ws) => ws.close());

      const page = await context.newPage();
      const remaining = () => deadline - Date.now();
      const open = (url: URL) => page.goto(url.href, { waitUntil: "domcontentloaded", timeout: Math.min(15_000, remaining()) });
      const www = withWww(start);
      await open(start).catch(async (error: unknown) => {
        if (!www || !(await isPublicHost(www.hostname))) throw error;
        await open(www);
      });
      await settle(page, Math.min(5_000, Math.max(0, remaining() - 12_000)));
      const finalUrl = new URL(page.url());
      if (!(await isPublicHost(finalUrl.hostname))) throw new FetchBlockedError("Sidan pekar på en intern adress");

      await page.evaluate(dismissOverlays).catch(() => 0);
      const home = await page.evaluate(collectPage, LOGO_ATTRIBUTE);
      const screenshot = await page.screenshot({ type: "jpeg", quality: 70, scale: "css", timeout: 5000 }).catch(() => null);
      const logos: RenderedLogo[] = [];
      for (const logo of home.logos) logos.push({ ...logo, shot: await logoShot(page, logo.index) });

      const host = finalUrl.hostname.replace(/^www\./, "");
      const pages = [finalUrl.href];
      const extra: RenderedSite["extra"] = [];
      for (const link of home.links.slice(0, MAX_SUBPAGES)) {
        if (remaining() < SUBPAGE_MIN_REMAINING_MS) break;
        try {
          await page.goto(link, { waitUntil: "domcontentloaded", timeout: 7_000 });
          const here = new URL(page.url());
          if (here.hostname.replace(/^www\./, "") !== host) continue;
          const sub = await page.evaluate(() => ({
            headings: [...document.querySelectorAll("h1, h2, h3")].map((h) => (h.textContent ?? "").replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 16),
            text: ((document.querySelector("main") ?? document.body) as HTMLElement).innerText.replace(/\s+/g, " ").trim().slice(0, 2500),
          }));
          extra.push(sub);
          pages.push(here.href);
        } catch {
          // En undersida som inte laddar hoppas över.
        }
      }
      return { url: finalUrl.href, host, pages, home, extra, screenshot, logos };
    } finally {
      await context.close().catch(() => {});
    }
  } finally {
    release();
  }
}
