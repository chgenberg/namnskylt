import sharp from "sharp";
import { clientKey, createRateLimiter } from "@/lib/ai/rate-limit";
import { databaseConfigured, getOrderByPackingCode } from "@/lib/orders/repository";
import { renderMailBadge } from "@/lib/quotes/mail-image";

export const runtime = "nodejs";

/** Mejlet visar bilden 120 px bred: 360 px räcker för skarpa skärmar, och en order med många namn laddar fort. */
const WIDTH_PX = 360;
/** Skylten fyller bilden, med plats för skuggan under: bilden är liten i mejlet. */
const FILL = { width: 0.88, height: 0.78 };

/** Bilderna hämtas av e-postklienter, ofta genom en mellanserver som många delar. Taket skyddar bara mot rena missbruk. */
const perClient = createRateLimiter({ limit: 600, windowMs: 60 * 60 * 1000 });

/**
 * En skylt i ordern som bild, till verkstadens orderbekräftelse till kunden (besked av ägaren
 * 2026-11-24: "en bild på respektive namnskylt som man beställt"). Adressen är
 * `/f/<följesedelns kod>/skylt/<n>.png`, där n är skyltens nummer i ordern från 1, samma som radens
 * referens hos verkstaden. Koden är behörigheten, som för följesedeln, och bilden visar bara skylten:
 * samma ritning som kunden såg, utan priser, adress eller namn på beställaren.
 */
export async function GET(request: Request, { params }: { params: Promise<{ code: string; bild: string }> }) {
  if (!databaseConfigured()) return new Response("Hittades inte", { status: 404 });
  if (!perClient.take(clientKey(request))) return new Response("För många förfrågningar", { status: 429 });
  const { code, bild } = await params;
  const line = /^(\d{1,3})\.png$/.exec(bild)?.[1];
  if (!line || !/^[0-9a-f]{12}$/i.test(code)) return new Response("Hittades inte", { status: 404 });
  const order = await getOrderByPackingCode(code.toLowerCase());
  const badge = order?.badges[Number(line) - 1];
  if (!order || order.status === "cancelled" || !badge) return new Response("Hittades inte", { status: 404 });
  try {
    const png = await sharp(await renderMailBadge(badge, FILL)).resize({ width: WIDTH_PX }).png({ compressionLevel: 9 }).toBuffer();
    return new Response(new Uint8Array(png), {
      // En lagd orders skyltar ändras inte: bilden får ligga kvar hos e-postklientens mellanserver.
      headers: { "content-type": "image/png", "cache-control": "public, max-age=86400", "x-robots-tag": "noindex" },
    });
  } catch (error) {
    console.error("Skyltens bild till orderbekräftelsen kunde inte ritas", error);
    return new Response("Bilden kunde inte ritas", { status: 500 });
  }
}
