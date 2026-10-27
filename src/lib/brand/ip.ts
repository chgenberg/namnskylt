import { isIP } from "node:net";

/** IPv4-block som aldrig får nås från servern: privata, lokala, reserverade. */
const BLOCKED_V4: readonly [string, number][] = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

function v4ToNumber(ip: string): number {
  return ip.split(".").reduce((n, part) => n * 256 + Number(part), 0);
}

function inV4Block(ip: string, [base, bits]: readonly [string, number]): boolean {
  const size = 2 ** (32 - bits);
  return Math.floor(v4ToNumber(ip) / size) === Math.floor(v4ToNumber(base) / size);
}

function isPublicV4(ip: string): boolean {
  return !BLOCKED_V4.some((block) => inV4Block(ip, block));
}

/** IPv6 som åtta 16-bitarsgrupper; en inbäddad IPv4-svans räknas om till två grupper. */
function expandV6(ip: string): number[] | null {
  let address = ip.toLowerCase().split("%")[0] ?? "";
  const v4Tail = /(\d+\.\d+\.\d+\.\d+)$/.exec(address);
  if (v4Tail?.[1]) {
    const n = v4ToNumber(v4Tail[1]);
    address = `${address.slice(0, -v4Tail[1].length)}${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`;
  }
  const [head = "", tail] = address.split("::");
  const parse = (part: string) => (part ? part.split(":").map((g) => parseInt(g, 16)) : []);
  const left = parse(head);
  const right = tail === undefined ? [] : parse(tail);
  const missing = 8 - left.length - right.length;
  if (missing < 0 || (tail === undefined && missing !== 0)) return null;
  const groups = [...left, ...new Array<number>(missing).fill(0), ...right];
  return groups.every((g) => Number.isInteger(g) && g >= 0 && g <= 0xffff) ? groups : null;
}

function isPublicV6(ip: string): boolean {
  const g = expandV6(ip);
  if (!g) return false;
  const [a = 0, b = 0, , , , f = 0, x = 0, y = 0] = g;
  const embeddedV4 = `${x >> 8}.${x & 255}.${y >> 8}.${y & 255}`;
  if (g.slice(0, 7).every((v) => v === 0)) return false; // :: och ::1
  if (g.slice(0, 5).every((v) => v === 0) && f === 0xffff) return isPublicV4(embeddedV4);
  if (a === 0x64 && b === 0xff9b) return isPublicV4(embeddedV4);
  if ((a & 0xfe00) === 0xfc00) return false; // unik lokal
  if ((a & 0xffc0) === 0xfe80) return false; // länklokal
  if ((a & 0xff00) === 0xff00) return false; // multicast
  if (a === 0x2001 && b === 0x0db8) return false; // dokumentation
  return true;
}

/** `true` bara för adresser på det publika internet. */
export function isPublicAddress(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return isPublicV4(ip);
  if (version === 6) return isPublicV6(ip);
  return false;
}
