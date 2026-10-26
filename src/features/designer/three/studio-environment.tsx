import { Environment } from "@react-three/drei";
import { useLoader, useThree } from "@react-three/fiber";
import { Suspense, useLayoutEffect, useMemo } from "react";
import { EquirectangularReflectionMapping, FloatType, PMREMGenerator, type DataTexture } from "three";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { STUDIO_HDRI } from "../assets";

/** Hur mycket av HDRI:ns färgstick som tas bort (1 = helt grå). */
const DESATURATE = 0.9;
/** Rumsljuset är ljusare än studion — dämpas så att bytet inte syns som ett blink. */
const ROOM_INTENSITY_RATIO = 0.6;

function configure(loader: HDRLoader) {
  loader.setDataType(FloatType);
}

/**
 * Studio-HDRI som ljusmiljö, avfärgad: fotostudior har ofta en svag
 * kall eller varm ton som annars färgar vit plast. Ljusets riktning och
 * styrka behålls — både rasterbilden och strålspårningen ljuses av den.
 */
function StudioHdri({ intensity }: { intensity: number }) {
  const source = useLoader(HDRLoader, STUDIO_HDRI, configure) as DataTexture;

  const map = useMemo(() => {
    const data = source.image.data as Float32Array;
    for (let i = 0; i < data.length; i += 4) {
      const luminance = 0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]!;
      for (let c = 0; c < 3; c++) data[i + c] = data[i + c]! + (luminance - data[i + c]!) * DESATURATE;
    }
    source.mapping = EquirectangularReflectionMapping;
    source.needsUpdate = true;
    return source;
  }, [source]);

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
