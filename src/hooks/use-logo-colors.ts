"use client";

import { useEffect, useState } from "react";
import { logoPalette } from "@/engine";

/** Loggans färger hålls kvar per bild, så att de inte läses om varje gång panelen ritas. */
const known = new Map<string, string[]>();
/** Längsta sidan när loggan läses. Färgerna syns lika bra i en liten bild. */
const READ_SIZE = 128;

/**
 * Läser färgerna ur en bild i webbläsaren, den som täcker mest först. Går bilden inte att
 * läsa blir svaret tomt: då visas inga förslag, och färgvalet fungerar som vanligt.
 */
export function readLogoColors(src: string): Promise<string[]> {
  const cached = known.get(src);
  if (cached) return Promise.resolve(cached);
  return new Promise((resolve) => {
    const image = new Image();
    image.onerror = () => resolve([]);
    image.onload = () => {
      const scale = Math.min(1, READ_SIZE / Math.max(image.naturalWidth, image.naturalHeight, 1));
      const width = Math.max(1, Math.round(image.naturalWidth * scale));
      const height = Math.max(1, Math.round(image.naturalHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return resolve([]);
      context.drawImage(image, 0, 0, width, height);
      try {
        const colors = logoPalette({ data: context.getImageData(0, 0, width, height).data, width, height });
        known.set(src, colors);
        resolve(colors);
      } catch {
        resolve([]);
      }
    };
    image.src = src;
  });
}

/**
 * Loggans färger, lästa ur dess bild i webbläsaren, den som täcker mest först
 * (besked av ägaren 2026-11-19: systemet ska läsa av loggans färger när en
 * logga läggs in). En svartvit logga har ingen bild, och då inga färger.
 */
export function useLogoColors(src: string | null): string[] {
  const [read, setRead] = useState<{ src: string; colors: string[] } | null>(null);
  useEffect(() => {
    if (!src || known.has(src)) return;
    let current = true;
    void readLogoColors(src).then((colors) => {
      if (current) setRead({ src, colors });
    });
    return () => {
      current = false;
    };
  }, [src]);
  if (!src) return [];
  return known.get(src) ?? (read?.src === src ? read.colors : []);
}
