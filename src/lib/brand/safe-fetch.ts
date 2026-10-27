import "server-only";
import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import http from "node:http";
import https from "node:https";
import type { LookupFunction } from "node:net";
import zlib from "node:zlib";
import { isPublicAddress } from "./ip";
import { FetchBlockedError, parsePublicUrl } from "./url";

export interface SafeResponse {
  url: string;
  contentType: string;
  body: Buffer;
}

interface SafeFetchOptions {
  maxBytes: number;
  timeoutMs: number;
  accept: string;
}

const MAX_REDIRECTS = 4;
const USER_AGENT = "Mozilla/5.0 (compatible; NamnskyltBot/1.0; +https://namnskylt.se)";

/**
 * DNS-uppslag som vägrar icke-publika adresser. Körs vid varje anslutning, så
 * en domän som byter till en intern adress mellan kontroll och anrop
 * (DNS rebinding) ändå stoppas.
 */
const publicLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error, "", 4);
    const list = (Array.isArray(addresses) ? addresses : []) as LookupAddress[];
    const blocked = list.length === 0 || list.some((a) => !isPublicAddress(a.address));
    if (blocked) return callback(new FetchBlockedError(`Adressen är inte publik: ${hostname}`), "", 4);
    if (options.all) return callback(null, list);
    const first = list[0]!;
    callback(null, first.address, first.family);
  });
};

/** Packat svar får växa till så här många gånger taket — skydd mot zip-bomber. */
const MAX_INFLATE_RATIO = 4;

function decode(body: Buffer, encoding: string | undefined, maxBytes: number): Buffer {
  const limit = { maxOutputLength: maxBytes * MAX_INFLATE_RATIO };
  if (encoding === "gzip" || encoding === "x-gzip") return zlib.gunzipSync(body, limit);
  if (encoding === "br") return zlib.brotliDecompressSync(body, limit);
  if (encoding === "deflate") return zlib.inflateSync(body, limit);
  return body;
}

function requestOnce(url: URL, options: SafeFetchOptions, deadline: number) {
  return new Promise<{ status: number; location?: string; contentType: string; body: Buffer }>(
    (resolve, reject) => {
      const client = url.protocol === "https:" ? https : http;
      const request = client.request(
        url,
        {
          method: "GET",
          lookup: publicLookup,
          headers: {
            "user-agent": USER_AGENT,
            accept: options.accept,
            "accept-encoding": "gzip, deflate, br",
            "accept-language": "sv-SE,sv;q=0.9,en;q=0.6",
          },
          timeout: Math.max(1, deadline - Date.now()),
        },
        (response) => {
          const status = response.statusCode ?? 0;
          const location = response.headers.location;
          if (status >= 300 && status < 400 && location) {
            response.resume();
            resolve({ status, location, contentType: "", body: Buffer.alloc(0) });
            return;
          }
          const declared = Number(response.headers["content-length"] ?? 0);
          if (declared > options.maxBytes) {
            request.destroy(new FetchBlockedError("För stort svar"));
            return;
          }
          const chunks: Buffer[] = [];
          let size = 0;
          response.on("data", (chunk: Buffer) => {
            size += chunk.length;
            if (size > options.maxBytes) {
              request.destroy(new FetchBlockedError("För stort svar"));
              return;
            }
            chunks.push(chunk);
          });
          response.on("end", () => {
            try {
              const body = decode(Buffer.concat(chunks), response.headers["content-encoding"], options.maxBytes);
              resolve({ status, contentType: String(response.headers["content-type"] ?? ""), body });
            } catch (error) {
              reject(error);
            }
          });
          response.on("error", reject);
        },
      );
      request.on("timeout", () => request.destroy(new Error("Tidsgräns")));
      request.on("error", reject);
      request.end();
    },
  );
}

/** GET mot en publik adress med tak för storlek, tid och antal omdirigeringar. */
export async function safeFetch(raw: string | URL, options: SafeFetchOptions): Promise<SafeResponse> {
  const deadline = Date.now() + options.timeoutMs;
  let url = typeof raw === "string" ? parsePublicUrl(raw) : parsePublicUrl(raw.href);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (Date.now() >= deadline) throw new Error("Tidsgräns");
    const response = await requestOnce(url, options, deadline);
    if (response.location) {
      url = parsePublicUrl(new URL(response.location, url).href);
      continue;
    }
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`HTTP ${response.status} från ${url.hostname}`);
    }
    return { url: url.href, contentType: response.contentType, body: response.body };
  }
  throw new FetchBlockedError("För många omdirigeringar");
}
