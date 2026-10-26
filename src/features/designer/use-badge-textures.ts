"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CanvasTexture, SRGBColorSpace, type Texture } from "three";
import { layoutBadge, renderBadgeSvg, type BadgeDocument, type TextMeasurer } from "@/engine";

/** Upplösning i texturen. 14 px/mm ger skarp text på 4K utan stora uppladdningar. */
const PX_PER_MM = 14;
const MAX_ANISOTROPY = 8;

export interface BadgeTextures {
  color: Texture;
  bump: Texture;
  roughness: Texture;
}

function svgToTexture(svg: string, srgb: boolean): Promise<Texture> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("Canvas 2D saknas"));
        return;
      }
      context.drawImage(image, 0, 0);
      const texture = new CanvasTexture(canvas);
      texture.anisotropy = MAX_ANISOTROPY;
      if (srgb) texture.colorSpace = SRGBColorSpace;
      resolve(texture);
    };
    image.onerror = () => reject(new Error("Kunde inte rita skyltens SVG"));
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

/**
 * Bygger 3D-vyns kartor ur samma layout som ritningen. Föregående uppsättning
 * står kvar tills den nya är klar, så skylten aldrig blinkar vid ändringar.
 */
export function useBadgeTextures(doc: BadgeDocument, measure: TextMeasurer): BadgeTextures | null {
  const svgs = useMemo(() => {
    const layout = layoutBadge(doc, measure);
    const render = (mode: "texture-color" | "texture-bump" | "texture-roughness") =>
      renderBadgeSvg(doc, layout, { mode, pxPerMm: PX_PER_MM });
    return {
      color: render("texture-color"),
      bump: render("texture-bump"),
      roughness: render("texture-roughness"),
    };
  }, [doc, measure]);

  const [textures, setTextures] = useState<BadgeTextures | null>(null);
  const latest = useRef<BadgeTextures | null>(null);
  latest.current = textures;

  useEffect(
    () => () => {
      if (latest.current) Object.values(latest.current).forEach((t: Texture) => t.dispose());
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      svgToTexture(svgs.color, true),
      svgToTexture(svgs.bump, false),
      svgToTexture(svgs.roughness, false),
    ])
      .then(([color, bump, roughness]) => {
        if (cancelled) {
          [color, bump, roughness].forEach((t) => t.dispose());
          return;
        }
        setTextures((previous) => {
          if (previous) Object.values(previous).forEach((t: Texture) => t.dispose());
          return { color, bump, roughness };
        });
      })
      .catch((error: unknown) => console.error(error));
    return () => {
      cancelled = true;
    };
  }, [svgs]);

  return textures;
}
