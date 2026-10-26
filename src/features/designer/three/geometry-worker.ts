import type { BadgeDocument, EngravedPath } from "@/engine";
import { buildBadgeGeometry } from "./geometry";
import { toArrays, type BadgeArrays, type GeometryResponse } from "./geometry-arrays";

interface Job {
  id: number;
  doc: BadgeDocument;
  engraving: EngravedPath[] | null;
  /** `null` när ett nyare bygge tagit jobbets plats innan det hann starta. */
  resolve: (arrays: BadgeArrays | null) => void;
  reject: (error: unknown) => void;
}

let worker: Worker | null | undefined;
let running: Job | null = null;
let queued: Job | null = null;
let nextId = 1;

function buildOnMainThread(job: Job) {
  window.setTimeout(() => {
    try {
      const parts = buildBadgeGeometry(job.doc, job.engraving);
      job.resolve(toArrays(parts));
      parts.forEach((part) => part.dispose());
    } catch (error) {
      job.reject(error);
    }
  }, 0);
}

function finish(job: Job) {
  if (running === job) running = null;
  pump();
}

function onMessage({ data }: MessageEvent<GeometryResponse>) {
  const job = running;
  if (!job || job.id !== data.id) return;
  if ("arrays" in data) job.resolve(data.arrays);
  else job.reject(new Error(data.error));
  finish(job);
}

/** Workern gick inte att starta — resten byggs på huvudtråden som förut. */
function onWorkerFailure(error: unknown) {
  worker?.terminate();
  worker = null;
  const job = running;
  running = null;
  if (job) buildOnMainThread(job);
  pump();
  console.error("Geometri-workern föll bort", error);
}

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(new URL("./geometry.worker.ts", import.meta.url));
    worker.onmessage = onMessage;
    worker.onerror = onWorkerFailure;
  } catch (error) {
    worker = null;
    console.error("Geometri-workern kunde inte startas", error);
  }
  return worker;
}

function pump() {
  if (running || !queued) return;
  const job = queued;
  queued = null;
  const target = getWorker();
  if (!target) {
    buildOnMainThread(job);
    return;
  }
  running = job;
  target.postMessage({ id: job.id, doc: job.doc, engraving: job.engraving });
}

/**
 * Den frästa skylten, byggd i en worker. Bara det senaste bygget köas: ändrar
 * kunden flera gånger under ett pågående bygge hoppas mellanlägena över.
 */
export function buildExactGeometry(
  doc: BadgeDocument,
  engraving: EngravedPath[] | null,
): Promise<BadgeArrays | null> {
  return new Promise((resolve, reject) => {
    queued?.resolve(null);
    queued = { id: nextId++, doc, engraving, resolve, reject };
    pump();
  });
}
