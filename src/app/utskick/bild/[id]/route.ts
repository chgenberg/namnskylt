import { db } from "@/lib/db/client";
import { assetIdFromPath } from "@/lib/outreach/badge-asset";
import { getAssetBytes } from "@/lib/outreach/repository";

export const runtime = "nodejs";

const NOT_FOUND_HEADERS = { "cache-control": "no-store", "x-robots-tag": "noindex" };

/** Skylten och materialrutorna i mejlet. En bild byts aldrig ut under samma id. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = assetIdFromPath((await params).id);
  const sql = db();
  const asset = id && sql ? await getAssetBytes(sql, id) : null;
  if (!asset) return new Response("Bilden finns inte", { status: 404, headers: NOT_FOUND_HEADERS });
  return new Response(new Uint8Array(asset.bytes), {
    headers: {
      "content-type": asset.mime,
      "cache-control": "public, max-age=31536000, immutable",
      "x-robots-tag": "noindex",
    },
  });
}
