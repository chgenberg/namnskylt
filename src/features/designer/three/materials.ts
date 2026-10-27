import { useEffect, useMemo } from "react";
import { Color, MeshPhysicalMaterial, Vector2 } from "three";
import { getColor, getMaterial, type BadgeDocument, type MaterialFinish } from "@/engine";
import { brushedNormalMap } from "./brushed-normal";

/** Borstningens täthet: kartan upprepas så här många gånger per scenenhet (≈29 mm). */
const BRUSH_REPEAT = 1.6;
/** Mässingen är satinerad; aluminium och stål borstade. */
const METAL_ROUGHNESS: Record<MaterialFinish, number> = {
  aluminium: 0.3,
  steel: 0.24,
  brass: 0.26,
  plastic: 0.3,
  acrylic: 0.12,
  epoxy: 0.06,
};

/**
 * Färgad metall (guld, mässing) blir grumlig med metalness 1 och skärmens sRGB-ton —
 * verklig mässing reflekterar mycket ljusare. Lyft mättade metaller mot sin reflektans.
 */
function metalBase(hex: string): Color {
  const color = new Color(hex);
  const { s } = color.getHSL({ h: 0, s: 0, l: 0 });
  return s > 0.3 ? color.lerp(new Color("#fff3d6"), 0.4) : color;
}

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
    if (finish === "acrylic" || finish === "epoxy") {
      // Blank kupol eller akrylskiva över tryck: låg råhet, trycket ligger i ytan.
      const gloss = finish === "epoxy" ? 0.06 : 0.12;
      const metalness = color.metallic ? 0.55 : 0;
      return [
        new MeshPhysicalMaterial({ color: color.surface, roughness: gloss, metalness, specularIntensity: 1 }),
        // Kanten är samma tryckta skiva som ytan; bara texten har gravyrfärgen.
        new MeshPhysicalMaterial({ color: color.surface, roughness: gloss + 0.2, metalness }),
        new MeshPhysicalMaterial({ color: color.engraving, roughness: gloss + 0.1, metalness: isDark(color.engraving) ? 0 : 0.6 }),
      ];
    }
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
      color: metalBase(color.surface),
      metalness: 1,
      roughness: METAL_ROUGHNESS[finish],
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
  }, [finish, color.surface, color.engraving, color.metallic]);

  useEffect(() => () => materials.forEach((m) => m.dispose()), [materials]);
  return materials;
}
