import { BufferAttribute, BufferGeometry } from "three";
import type { BadgeDocument, EngravedPath } from "@/engine";
import type { BadgeGeometry } from "./geometry";

const ITEM_SIZE = { position: 3, normal: 3, uv: 2 } as const;
type AttributeName = keyof typeof ITEM_SIZE;

/** En materialplats som rena arrayer — det som skickas mellan worker och sida. */
export type SlotArrays = Record<AttributeName, Float32Array>;
export type BadgeArrays = [surface: SlotArrays, core: SlotArrays, engraving: SlotArrays];

export interface GeometryRequest {
  id: number;
  doc: BadgeDocument;
  engraving: EngravedPath[] | null;
}

export type GeometryResponse = { id: number; arrays: BadgeArrays } | { id: number; error: string };

const NAMES = Object.keys(ITEM_SIZE) as AttributeName[];

function float32(part: BufferGeometry, name: AttributeName): Float32Array {
  const { array } = part.getAttribute(name);
  return array instanceof Float32Array ? array : Float32Array.from(array);
}

export function toArrays(geometry: BadgeGeometry): BadgeArrays {
  const slot = (part: BufferGeometry) =>
    Object.fromEntries(NAMES.map((name) => [name, float32(part, name)])) as SlotArrays;
  return [slot(geometry[0]), slot(geometry[1]), slot(geometry[2])];
}

export function fromArrays(arrays: BadgeArrays): BadgeGeometry {
  const slot = (data: SlotArrays) => {
    const part = new BufferGeometry();
    for (const name of NAMES) part.setAttribute(name, new BufferAttribute(data[name], ITEM_SIZE[name]));
    return part;
  };
  return [slot(arrays[0]), slot(arrays[1]), slot(arrays[2])];
}

/** Buffertarna att flytta i stället för att kopiera — var och en bara en gång. */
export function transferList(arrays: BadgeArrays): ArrayBuffer[] {
  const buffers = new Set<ArrayBuffer>();
  for (const slot of arrays) {
    for (const name of NAMES) {
      const { buffer } = slot[name];
      if (buffer instanceof ArrayBuffer) buffers.add(buffer);
    }
  }
  return [...buffers];
}
