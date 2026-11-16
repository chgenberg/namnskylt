import { useEffect, useMemo, useState } from "react";
import { DoubleSide, Float32BufferAttribute, SRGBColorSpace, ShapeGeometry, TextureLoader, type Texture } from "three";
import { getColor, layoutBadge, type BadgeDocument, type EngravedPath, type FontEngine, type Rect } from "@/engine";
import { UNITS_PER_MM, glyphShapes, printSurface } from "./geometry";

/** Trycket ligger en hårsmån över ytan, så att det inte flimrar mot plattan. */
const LIFT_UNITS = 0.002;
const ANISOTROPY = 8;

/**
 * Trycket som en yta i loggans egen form, med bilden lagd över. Ytan följer
 * siluetten i stället för bildens ruta: en ruta med genomskinliga delar syns
 * som en svag rektangel i fotoläget.
 */
function printGeometry(size: BadgeDocument["size"], silhouette: string, box: Rect): ShapeGeometry | null {
  const shapes = glyphShapes({ size }, [{ d: silhouette, fillRule: "evenodd" }]);
  if (shapes.length === 0) return null;
  const geometry = new ShapeGeometry(shapes);
  // Bildens ruta i scenens koordinater, där y pekar uppåt; bildens överkant är v = 1.
  const left = (box.x - size.widthMm / 2) * UNITS_PER_MM;
  const top = (size.heightMm / 2 - box.y) * UNITS_PER_MM;
  const width = box.width * UNITS_PER_MM;
  const height = box.height * UNITS_PER_MM;
  const position = geometry.getAttribute("position");
  const uv = new Float32Array(position.count * 2);
  for (let i = 0; i < position.count; i++) {
    uv[i * 2] = (position.getX(i) - left) / width;
    uv[i * 2 + 1] = 1 - (top - position.getY(i)) / height;
  }
  geometry.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  return geometry;
}

interface LogoPrintProps {
  doc: BadgeDocument;
  fonts: FontEngine;
  /** Framsidans z. */
  frontZ: number;
  /** Anropas när bilden är laddad eller borta, så att fotoläget kan räkna om. */
  onTexture: (texture: Texture | null) => void;
}

/** En logga i färg, tryckt på skyltens framsida. En graverad logga fräses i stället ur plattan. */
export function LogoPrint({ doc, fonts, frontZ, onTexture }: LogoPrintProps) {
  const logo = useMemo(() => layoutBadge(doc, fonts).logo, [doc, fonts]);
  const src = logo?.imageSrc;
  const [texture, setTexture] = useState<Texture | null>(null);

  useEffect(() => {
    if (!src) return;
    let active = true;
    const loaded = new TextureLoader().load(src, () => {
      if (active) setTexture(loaded);
    });
    loaded.colorSpace = SRGBColorSpace;
    loaded.anisotropy = ANISOTROPY;
    return () => {
      active = false;
      setTexture((current) => (current === loaded ? null : current));
      loaded.dispose();
    };
  }, [src]);

  useEffect(() => {
    onTexture(texture);
  }, [texture, onTexture]);

  // Ytan byggs bara om när loggan flyttas eller ändrar storlek — inte för varje bokstav kunden skriver.
  const { widthMm, heightMm } = doc.size;
  const { d, x = 0, y = 0, width = 0, height = 0 } = logo ?? {};
  const geometry = useMemo(
    () => (src && d ? printGeometry({ widthMm, heightMm }, d, { x, y, width, height }) : null),
    [src, d, x, y, width, height, widthMm, heightMm],
  );
  useEffect(() => () => geometry?.dispose(), [geometry]);

  if (!geometry || !texture) return null;
  return (
    <mesh geometry={geometry} position={[0, 0, frontZ + LIFT_UNITS]}>
      {/* Oberoende av ljussättningen, så att färgerna blir exakt filens. */}
      <meshBasicMaterial map={texture} transparent depthWrite={false} toneMapped={false} side={DoubleSide} />
    </mesh>
  );
}

interface InkPrintProps {
  doc: BadgeDocument;
  /** Det som printas i gravyrens färg: namnet, ramen eller en svartvit logga. Se `printedPaths`. */
  printed: readonly EngravedPath[];
  frontZ: number;
}

/**
 * Print i en färg på skyltens framsida: ett namn eller en logga som kunden har
 * valt att printa i stället för att gravera. Trycket ligger plant på ytan, i
 * gravyrens färg, och fräses aldrig ur plattan.
 */
export function InkPrint({ doc, printed, frontZ }: InkPrintProps) {
  const geometry = useMemo(() => (printed.length > 0 ? printSurface(doc, printed) : null), [doc, printed]);
  useEffect(() => () => geometry?.dispose(), [geometry]);
  if (!geometry) return null;
  return (
    <mesh geometry={geometry} position={[0, 0, frontZ + LIFT_UNITS]}>
      <meshStandardMaterial color={getColor(doc.materialId, doc.colorId).engraving} roughness={0.62} metalness={0} />
    </mesh>
  );
}
