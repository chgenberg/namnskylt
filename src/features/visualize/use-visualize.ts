"use client";

import { useCallback, useEffect, useState } from "react";
import type { BadgeDocument } from "@/engine";
import { requestPerson, requestTryOn } from "./api";

export type Job<T> =
  | { status: "idle" }
  | { status: "working"; startedAt: number }
  | { status: "done"; result: T; badgeKey: string }
  | { status: "error"; message: string };

export type VisualizeMode = "person" | "try-on";

export interface CapturedPhoto {
  blob: Blob;
  url: string;
}

const IDLE = { status: "idle" } as const;

function badgeKey(doc: BadgeDocument): string {
  return JSON.stringify({ ...doc, quantity: 0 });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Något gick fel. Försök igen.";
}

/** Genererade bilder per designer-session — överlever byte av vy. */
export function useVisualize(doc: BadgeDocument) {
  const [mode, setMode] = useState<VisualizeMode>("person");
  const [person, setPerson] = useState<Job<string>>(IDLE);
  const [tryOn, setTryOn] = useState<Job<string>>(IDLE);
  const [photo, setPhotoState] = useState<CapturedPhoto | null>(null);
  /** Var personen står — fylls i från företagets hemsida eller av kunden. */
  const [workplace, setWorkplace] = useState("");

  useEffect(() => () => {
    if (photo) URL.revokeObjectURL(photo.url);
  }, [photo]);

  const setPhoto = useCallback((blob: Blob | null) => {
    setPhotoState(blob ? { blob, url: URL.createObjectURL(blob) } : null);
    setTryOn(IDLE);
  }, []);

  const generatePerson = useCallback(async () => {
    const badge = doc;
    setPerson({ status: "working", startedAt: Date.now() });
    try {
      const result = await requestPerson(badge, workplace);
      setPerson({ status: "done", result, badgeKey: badgeKey(badge) });
    } catch (error) {
      setPerson({ status: "error", message: errorMessage(error) });
    }
  }, [doc, workplace]);

  const generateTryOn = useCallback(async () => {
    if (!photo) return;
    const badge = doc;
    setTryOn({ status: "working", startedAt: Date.now() });
    try {
      const result = await requestTryOn(badge, photo.blob);
      setTryOn({ status: "done", result, badgeKey: badgeKey(badge) });
    } catch (error) {
      setTryOn({ status: "error", message: errorMessage(error) });
    }
  }, [doc, photo]);

  const currentKey = badgeKey(doc);
  const isStale = (job: Job<unknown>) => job.status === "done" && job.badgeKey !== currentKey;

  return {
    mode,
    setMode,
    person,
    tryOn,
    photo,
    setPhoto,
    workplace,
    setWorkplace,
    generatePerson,
    generateTryOn,
    isStale,
  };
}

export type VisualizeState = ReturnType<typeof useVisualize>;
