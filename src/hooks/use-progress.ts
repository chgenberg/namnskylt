"use client";

import { useEffect, useState } from "react";
import { clampPercent, estimatedPercent, timedPercent } from "@/lib/progress/estimate";

export interface ProgressOptions {
  active: boolean;
  /** Ett misslyckat jobb fylls inte till 100 — felet visas av anroparen. */
  failed?: boolean;
  /** Förväntad tid, eller exakt tid om `timed`. */
  expectedMs: number;
  timed?: boolean;
  /** Verklig andel 0–1 när den är känd; vinner över uppskattningen. */
  value?: number | null;
}

export type ProgressPhase = "hidden" | "running" | "done";

const TICK_MS = 100;
/** Hur länge "Klart · 100 %" syns innan bannern försvinner. */
const DONE_HOLD_MS = 1100;

export function useProgress({ active, failed = false, expectedMs, timed = false, value = null }: ProgressOptions) {
  const [prevActive, setPrevActive] = useState(active);
  const [phase, setPhase] = useState<ProgressPhase>(active ? "running" : "hidden");
  const [startedAt, setStartedAt] = useState(0);
  const [now, setNow] = useState(0);

  if (active !== prevActive) {
    setPrevActive(active);
    setPhase(active ? "running" : failed ? "hidden" : "done");
  }

  useEffect(() => {
    if (phase !== "running") return;
    const start = performance.now();
    setStartedAt(start);
    setNow(start);
    const timer = window.setInterval(() => setNow(performance.now()), TICK_MS);
    return () => window.clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    if (phase !== "done") return;
    const timer = window.setTimeout(() => setPhase("hidden"), DONE_HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);

  const elapsedMs = Math.max(0, now - startedAt);
  const percent =
    phase === "done"
      ? 100
      : phase === "hidden"
        ? 0
        : value !== null
          ? clampPercent(value * 100)
          : timed
            ? timedPercent(elapsedMs, expectedMs)
            : estimatedPercent(elapsedMs, expectedMs);

  return { phase, percent, elapsedMs };
}
