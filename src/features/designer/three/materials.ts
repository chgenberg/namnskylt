import { useEffect, useMemo } from "react";
import { Color, MeshPhysicalMaterial, Vector2 } from "three";
import { getColor, getMaterial, type BadgeDocument } from "@/engine";
import { brushedNormalMap } from "./brushed-normal";

/** Borstningens täthet: kartan upprepas så här många gånger per scenenhet (≈29 mm). */
const BRUSH_REPEAT = 1.6;

function isDark(hex: string): boolean {
  const { r, g, b } = new Color(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.25;
}

/**
 * Material i samma ordning som geometrins platser: ytskikt, kärna, gravyr.
 * Plast: blank ytfilm över en kärna i gravyrfärgen; fickan är fräst och matt.
 * Metall: borstad och anisotrop; gravyren är färgfylld eller lasermärkt.
 */
export function useBadgeMaterials(doc: BadgeDocument): MeshPhysicalMaterial[] {
  const { finish } = getMaterial(doc.materialId);
  const color = getColor(doc.materialId, doc.colorId);

  const materials = useMemo(() => {
    if (finish === "plastic") {
      return [
        // Ingen clearcoat: three-gpu-pathtracer 0.0.27 spårar den som svart.
        new MeshPhysicalMaterial({ color: color.surface, roughness: 0.3, specularIntensity: 0.8 }),
        new MeshPhysicalMaterial({ color: color.engraving, roughness: 0.5 }),
        new MeshPhysicalMaterial({ color: color.engraving, roughness: 0.82 }),
      ];
    }

    const normalMap = brushedNormalMap();
    normalMap.repeat.set(BRUSH_REPEAT, BRUSH_REPEAT);
    const metal = {
      color: color.surface,
      metalness: 1,
      roughness: finish === "aluminium" ? 0.3 : 0.24,
      normalMap,
      normalScale: new Vector2(0.35, 0.35),
      anisotropy: finish === "aluminium" ? 0.75 : 0.55,
    };
    const filled = isDark(color.engraving);
    return [
      new MeshPhysicalMaterial(metal),
      new MeshPhysicalMaterial({ ...metal, roughness: metal.roughness + 0.08 }),
      new MeshPhysicalMaterial({
        color: color.engraving,
        metalness: filled ? 0.1 : 0.85,
        roughness: filled ? 0.6 : 0.5,
      }),
    ];
  }, [finish, color.surface, color.engraving]);

  useEffect(() => () => materials.forEach((m) => m.dispose()), [materials]);
  return materials;
}
