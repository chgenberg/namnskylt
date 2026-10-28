"use client";

import { useEffect, useState } from "react";
import { isLightPixels, LOGO_SAMPLE_PX } from "@/lib/images/logo-plate";

/** Samma bedömning som servern gör inför PDF:en — så att förhandsvisningen visar samma platta. */
export function useLightLogo(src: string | null): boolean {
  const [light, setLight] = useState(false);
  useEffect(() => {
    if (!src) {
      setLight(false);
      return;
    }
    let active = true;
    const image = new Image();
    image.onload = () => {
      const scale = LOGO_SAMPLE_PX / Math.max(image.naturalWidth, image.naturalHeight, 1);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context || !active) return;
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      setLight(isLightPixels(context.getImageData(0, 0, canvas.width, canvas.height).data));
    };
    image.onerror = () => active && setLight(false);
    image.src = src;
    return () => {
      active = false;
    };
  }, [src]);
  return light;
}
