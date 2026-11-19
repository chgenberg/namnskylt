import { Environment } from "@react-three/drei";
import { useLoader, useThree } from "@react-three/fiber";
import { Suspense, useLayoutEffect, useMemo } from "react";
import { DataUtils, EquirectangularReflectionMapping, HalfFloatType, PMREMGenerator, type DataTexture } from "three";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { STUDIO_HDRI } from "../assets";

/** Hur mycket av HDRI:ns färgstick som tas bort (1 = helt grå). */
const DESATURATE = 0.9;
/** Rumsljuset är ljusare än studion — dämpas så att bytet inte syns som ett blink. */
const ROOM_INTENSITY_RATIO = 0.6;
/** Det största tal ett halvt flyttal rymmer. */
const HALF_FLOAT_MAX = 65504;

/**
 * Ljusmiljön läses som halva flyttal, som är laddarens förval. Hela flyttal går inte att
 * läsa av mjukt på äldre Apple-kretsar (`OES_texture_float_linear` saknas på iPhone och iPad
 * före de nyaste): bilden blir då svart, och en metallskylt, som bara speglar sin omgivning,
 * ritas svart. Så såg startsidan ut på en kollegas telefon 2026-11-19. Halva flyttal går att
 * läsa av mjukt överallt.
 */
function configure(loader: HDRLoader) {
  loader.setDataType(HalfFloatType);
}

/** Laddaren delar samma bild mellan vyerna, och den ska bara avfärgas en gång. */
const desaturated = new WeakSet<DataTexture>();

function desaturate(source: DataTexture): DataTexture {
  if (desaturated.has(source)) return source;
  desaturated.add(source);
  const data = source.image.data as Uint16Array | Float32Array | null;
  if (data) {
    const half = source.type === HalfFloatType;
    const read = (i: number) => (half ? DataUtils.fromHalfFloat(data[i]!) : data[i]!);
    for (let i = 0; i < data.length; i += 4) {
      const [r, g, b] = [read(i), read(i + 1), read(i + 2)];
      const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      for (const [c, value] of [r, g, b].entries()) {
        const gray = value + (luminance - value) * DESATURATE;
        data[i + c] = half ? DataUtils.toHalfFloat(Math.min(gray, HALF_FLOAT_MAX)) : gray;
      }
    }
  }
  source.mapping = EquirectangularReflectionMapping;
  source.needsUpdate = true;
  return source;
}

/**
 * Studio-HDRI som ljusmiljö, avfärgad: fotostudior har ofta en svag
 * kall eller varm ton som annars färgar vit plast. Ljusets riktning och
 * styrka behålls — både rasterbilden och strålspårningen ljuses av den.
 */
function StudioHdri({ intensity }: { intensity: number }) {
  const source = useLoader(HDRLoader, STUDIO_HDRI, configure) as DataTexture;
  const map = useMemo(() => desaturate(source), [source]);

  return (
    <Environment map={map} environmentIntensity={intensity} environmentRotation={[0, Math.PI / 2.4, 0]} />
  );
}

/** Ljusmiljö som räknas fram lokalt — skylten syns direkt medan HDRI:n laddas. */
function RoomLight({ intensity }: { intensity: number }) {
  const { gl, scene } = useThree();
  // Layout-effekt: städningen måste hinna före studions egen när den tar över.
  useLayoutEffect(() => {
    const pmrem = new PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const target = pmrem.fromScene(room, 0.04);
    scene.environment = target.texture;
    scene.environmentIntensity = intensity * ROOM_INTENSITY_RATIO;
    return () => {
      if (scene.environment === target.texture) scene.environment = null;
      target.dispose();
      room.dispose();
      pmrem.dispose();
    };
  }, [gl, scene, intensity]);
  return null;
}

export function StudioEnvironment({ intensity }: { intensity: number }) {
  return (
    <Suspense fallback={<RoomLight intensity={intensity} />}>
      <StudioHdri intensity={intensity} />
    </Suspense>
  );
}
