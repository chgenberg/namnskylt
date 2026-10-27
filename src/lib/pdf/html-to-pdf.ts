import "server-only";
import type { Browser } from "playwright-core";

const ARGS = ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"];

async function launch(): Promise<Browser> {
  const { chromium } = await import("playwright-core");
  const executablePath = process.env.CHROMIUM_PATH;
  if (executablePath) return chromium.launch({ executablePath, args: ARGS });
  try {
    return await chromium.launch({ args: ARGS });
  } catch {
    return chromium.launch({ channel: "chrome", args: ARGS });
  }
}

/** A4-PDF av fristående HTML. Sidan får inte hämta något — allt ska vara inbäddat. */
export async function htmlToPdf(html: string): Promise<Buffer> {
  const browser = await launch();
  try {
    const page = await browser.newPage();
    await page.route("**/*", (route) => (route.request().url().startsWith("data:") ? route.continue() : route.abort()));
    await page.setContent(html, { waitUntil: "load", timeout: 15_000 });
    return Buffer.from(await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true }));
  } finally {
    await browser.close();
  }
}
