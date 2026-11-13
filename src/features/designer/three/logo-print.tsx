import { useEffect, useMemo, useState } from "react";
import { SRGBColorSpace, TextureLoader, type Texture } from "three";
import { layoutBadge, type BadgeDocument, type FontEngine } from "@/engine";
import { UNITS_PER_MM } from "./geometry";

/** Trycket ligger en hårsmån över ytan, så att det inte flimrar mot plattan. */
const LIFT_UNITS = 0.002;
const ANISOTROPY = 8;
/** Helt genomskinliga delar av bilden ritas inte alls, så att fotoläget inte ser en ruta runt loggan. */
const ALPHA_TEST = 0.02;

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

  if (!logo?.imageSrc || !texture) return null;
  const x = (logo.x + logo.width / 2 - doc.size.widthMm / 2) * UNITS_PER_MM;
  // Scenens y pekar uppåt; dokumentets nedåt.
  const y = (doc.size.heightMm / 2 - (logo.y + logo.height / 2)) * UNITS_PER_MM;
  return (
    <mesh position={[x, y, frontZ + LIFT_UNITS]}>
      <planeGeometry args={[logo.width * UNITS_PER_MM, logo.height * UNITS_PER_MM]} />
      {/* Oberoende av ljussättningen, så att färgerna blir exakt filens. */}
      <meshBasicMaterial map={texture} transparent depthWrite={false} toneMapped={false} alphaTest={ALPHA_TEST} />
    </mesh>
  );
}
