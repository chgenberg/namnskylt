import { badgeDocumentSchema, type BadgeDocument } from "@/engine";

/**
 * En design i en länk: dokumentet som komprimerad JSON i base64url. Samma kod
 * körs i webbläsaren och på servern (båda har CompressionStream). Det som
 * avkodas är klientdata och valideras alltid med schemat.
 */

const VERSION_PREFIX = "1.";
/** Längre än så blir länken opraktisk i chattar och mejl — loggan får då stanna hemma. */
export const SHARE_MAX_CHARS = 12_000;
/** Tak för uppackat innehåll, så att en liten länk inte kan bli en enorm JSON. */
const MAX_INFLATED_BYTES = 256 * 1024;

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array {
  const base64 = text.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function pipe(bytes: Uint8Array, transform: CompressionStream | DecompressionStream, limit: number) {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(transform);
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new Error("För stort innehåll");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

async function pack(doc: BadgeDocument): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify({ ...doc, quantity: 1 }));
  const packed = await pipe(json, new CompressionStream("deflate-raw"), Infinity);
  return VERSION_PREFIX + toBase64Url(packed);
}

export interface ShareCode {
  code: string;
  /** Loggan var för stor för länken och togs bort. */
  droppedLogo: boolean;
}

export async function encodeShareCode(doc: BadgeDocument): Promise<ShareCode> {
  const code = await pack(doc);
  if (code.length <= SHARE_MAX_CHARS || !doc.logo) return { code, droppedLogo: false };
  const withoutLogo = { ...doc };
  delete withoutLogo.logo;
  return { code: await pack(withoutLogo), droppedLogo: true };
}

/** `null` för allt som inte är en giltig, delad skylt. */
export async function decodeShareCode(code: string | undefined | null): Promise<BadgeDocument | null> {
  if (!code || !code.startsWith(VERSION_PREFIX) || code.length > SHARE_MAX_CHARS * 2) return null;
  try {
    const bytes = await pipe(
      fromBase64Url(code.slice(VERSION_PREFIX.length)),
      new DecompressionStream("deflate-raw"),
      MAX_INFLATED_BYTES,
    );
    const parsed = badgeDocumentSchema.safeParse(JSON.parse(new TextDecoder().decode(bytes)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
