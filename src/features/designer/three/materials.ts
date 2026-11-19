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

/** Plåten som syns i kanten på en lackad skylt — mörk nog att teckna konturen mot en ljus scen. */
const LACQUER_EDGE = "#9EA3A9";
/**
 * Ren skärmvit lack bränner ut i studioljuset och försvinner mot den ljusa scenen.
 * Ytan dras en aning mot grått, som vit lack ser ut i verkligt ljus.
 */
const LACQUER_SHADE = "#8E9299";
const LACQUER_SHADE_AMOUNT = 0.32;

/**
 * Färgad metall (guld, mässing) blir grumlig med metalness 1 och skärmens sRGB-ton —
 * verklig mässing reflekterar mycket ljusare. Lyft mättade metaller mot sin reflektans.
 */
function metalBase(hex: string): Color {
  const color = new Color(hex);
  const { s } = color.getHSL({ h: 0, s: 0, l: 0 });
  return s > 0.3 ? color.lerp(new Color("#fff3d6"), 0.4) : color;
}

/**
 * Så mycket ljusare än sin egen färg blir en matt yta i studioljuset, vänd mot kameran
 * (mätt 2026-11-19 på alla plastfärger). Utan kompensation ritades varje plastfärg för ljus,
 * och de starka färgerna blektes av färgomvandlingen: orange #FF6A00 blev laxrosa #F9825A,
 * och blått #0057B8 blev ljusblått #1C73E8. Kunden såg alltså en annan färg i 3D än den
 * som valdes i panelen och som tillverkas.
 */
const STUDIO_GAIN = 1.7;

/** Plastens färg som den ska ligga i materialet, för att ritas som katalogens färg i studioljuset. */
export function litColor(hex: string): Color {
  return new Color(hex).multiplyScalar(1 / STUDIO_GAIN);
}

function isDark(hex: string): boolean {
  const { r, g, b } = new Color(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.25;
}

/**
 * Material i samma ordning som geometrins platser: ytskikt, kärna, gravyr.
 * Plast: blank ytfilm över en kärna i gravyrfärgen; fickan är fräst och matt.
 * Metall: borstad och anisotrop; gravyren är färgfylld eller lasermärkt.
 * Lackad metall: matt färg utan borstning, med plåten synlig i kanten.
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
    if (color.lacquered) {
      // Lackad plåt: slät, matt färg på framsidan. Kanten visar metallen under lacken.
      return [
        new MeshPhysicalMaterial({
          color: new Color(color.surface).lerp(new Color(LACQUER_SHADE), LACQUER_SHADE_AMOUNT),
          roughness: 0.42,
          specularIntensity: 0.6,
        }),
        new MeshPhysicalMaterial({ color: LACQUER_EDGE, metalness: 1, roughness: 0.4 }),
        new MeshPhysicalMaterial({ color: color.engraving, roughness: 0.6, metalness: 0.1 }),
      ];
    }
    if (finish === "plastic" && color.metallic) {
      // Guld- och silverplast har en borstad metallfilm överst. Kärnan och den frästa fickan är plast, som i övrig plast.
      const brush = brushedNormalMap();
      brush.repeat.set(BRUSH_REPEAT, BRUSH_REPEAT);
      return [
        new MeshPhysicalMaterial({
          color: metalBase(color.surface),
          metalness: 0.9,
          roughness: 0.34,
          normalMap: brush,
          normalScale: new Vector2(0.25, 0.25),
          anisotropy: 0.5,
        }),
        new MeshPhysicalMaterial({ color: litColor(color.engraving), roughness: 0.5 }),
        new MeshPhysicalMaterial({ color: litColor(color.engraving), roughness: 0.82 }),
      ];
    }
    if (finish === "plastic") {
      return [
        // Ingen clearcoat: three-gpu-pathtracer 0.0.27 spårar den som svart.
        new MeshPhysicalMaterial({ color: litColor(color.surface), roughness: 0.3, specularIntensity: 0.8 }),
        new MeshPhysicalMaterial({ color: litColor(color.engraving), roughness: 0.5 }),
        new MeshPhysicalMaterial({ color: litColor(color.engraving), roughness: 0.82 }),
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
  }, [finish, color.surface, color.engraving, color.metallic, color.lacquered]);

  useEffect(() => () => materials.forEach((m) => m.dispose()), [materials]);
  return materials;
}
