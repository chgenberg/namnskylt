import { DataTexture, LinearFilter, LinearMipmapLinearFilter, RepeatWrapping, RGBAFormat } from "three";

const SIZE = 512;
/** Hur hårt höjdskillnaderna slår igenom i normalerna. */
const STRENGTH = 2.2;

/** Deterministisk PRNG (mulberry32) — samma borstning vid varje laddning. */
function random(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let cached: DataTexture | null = null;

/**
 * Normalkarta för borstad metall: tusentals fina spår längs x. Varje rad får
 * ett eget djup som varierar långsamt längs spåret, så reflexen bryts upp i
 * strimmor i stället för att ligga som en blank spegel.
 */
export function brushedNormalMap(): DataTexture {
  if (cached) return cached;
  const next = random(0x5eed);
  const height = new Float32Array(SIZE * SIZE);

  for (let y = 0; y < SIZE; y++) {
    const depth = next();
    const phase = next() * Math.PI * 2;
    // Helt antal perioder per varv så att kartan upprepas utan skarv.
    const cycles = 1 + Math.floor(next() * 6);
    for (let x = 0; x < SIZE; x++) {
      const drift = 0.25 * Math.sin((x / SIZE) * cycles * Math.PI * 2 + phase);
      height[y * SIZE + x] = depth * 0.8 + drift + next() * 0.05;
    }
  }

  const at = (x: number, y: number) =>
    height[((y + SIZE) % SIZE) * SIZE + ((x + SIZE) % SIZE)]!;
  const data = new Uint8Array(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * STRENGTH;
      const dy = (at(x, y + 1) - at(x, y - 1)) * STRENGTH;
      const length = Math.hypot(dx, dy, 1);
      const i = (y * SIZE + x) * 4;
      data[i] = ((-dx / length) * 0.5 + 0.5) * 255;
      data[i + 1] = ((-dy / length) * 0.5 + 0.5) * 255;
      data[i + 2] = ((1 / length) * 0.5 + 0.5) * 255;
      data[i + 3] = 255;
    }
  }

  const texture = new DataTexture(data, SIZE, SIZE, RGBAFormat);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  cached = texture;
  return texture;
}
