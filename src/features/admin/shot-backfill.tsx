"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { approxFonts, type BadgeDocument } from "@/engine";
import type { BadgeRecorder } from "@/features/designer/three/recorder";
import { useFontEngine } from "@/hooks/use-font-engine";

const Badge3D = dynamic(() => import("@/features/designer/badge-3d"), { ssr: false, loading: () => null });

/** Miljöljuset laddas med första skylten; därefter räcker en kort stund per byte. */
const FIRST_SETTLE_MS = 1_800;
const NEXT_SETTLE_MS = 600;
const READY_POLL_MS = 200;
const ATTEMPTED_KEY = "ns-shot-attempted";
const noop = () => {};

export interface BackfillItem {
  kind: "order" | "quote";
  id: string;
  badge: BadgeDocument;
}

const keyOf = (item: BackfillItem) => `${item.kind}:${item.id}`;

function attempted(): Set<string> {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(ATTEMPTED_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

function remember(key: string) {
  const all = attempted();
  all.add(key);
  sessionStorage.setItem(ATTEMPTED_KEY, JSON.stringify([...all]));
}

/**
 * Ritar 3D-bilden till ordrar och offerter som saknar en, en i taget i en
 * osynlig vy, och sparar den. Ingen tjänst kostar något — det är webbläsarens
 * egen grafik, samma som i skyltmotorn.
 */
export function ShotBackfill({ items }: { items: BackfillItem[] }) {
  const router = useRouter();
  const fonts = useFontEngine();
  const recorderRef = useRef<BadgeRecorder | null>(null);
  const [queue, setQueue] = useState<BackfillItem[]>([]);
  const [index, setIndex] = useState(0);
  const savedAny = useRef(false);

  useEffect(() => {
    const done = attempted();
    setQueue(items.filter((item) => !done.has(keyOf(item))));
    setIndex(0);
  }, [items]);

  const current = queue[index];
  const fontsReady = fonts !== approxFonts;

  useEffect(() => {
    if (!current || !fontsReady) return;
    let cancelled = false;
    const settle = index === 0 ? FIRST_SETTLE_MS : NEXT_SETTLE_MS;
    const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

    (async () => {
      while (!cancelled && !recorderRef.current) await wait(READY_POLL_MS);
      await wait(settle);
      if (cancelled) return;
      const shot = recorderRef.current?.still() ?? null;
      remember(keyOf(current));
      if (shot) {
        const response = await fetch("/api/admin/shots", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ kind: current.kind, id: current.id, badgeShot: shot }),
        }).catch(() => null);
        if (response?.ok) savedAny.current = true;
      }
      if (cancelled) return;
      if (index + 1 < queue.length) setIndex(index + 1);
      else if (savedAny.current) router.refresh();
    })();

    return () => {
      cancelled = true;
    };
  }, [current, fontsReady, index, queue.length, router]);

  if (!current) return null;
  return (
    <div
      aria-hidden="true"
      style={{ position: "fixed", left: 0, top: 0, width: 900, height: 560, opacity: 0, pointerEvents: "none", zIndex: -1 }}
    >
      <Badge3D
        doc={current.badge}
        fonts={fonts}
        spinning={false}
        focus={null}
        engrave={null}
        onEngraveDone={noop}
        photo={false}
        photoSamples={0}
        onPhotoProgress={noop}
        recorderRef={recorderRef}
      />
    </div>
  );
}
