import { Environment } from "@react-three/drei";
import { useLoader } from "@react-three/fiber";
import { useMemo } from "react";
import { EquirectangularReflectionMapping, FloatType, type DataTexture } from "three";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";

/** Poly Haven, CC0. Studio med mjuka softboxar — ger reflexerna i kant och gravyr. */
const HDRI = "/hdri/studio_small_08.hdr";
/** Hur mycket av HDRI:ns färgstick som tas bort (1 = helt grå). */
const DESATURATE = 0.9;

function configure(loader: HDRLoader) {
  loader.setDataType(FloatType);
}

/**
 * Studio-HDRI som ljusmiljö, avfärgad: fotostudior har ofta en svag
 * kall eller varm ton som annars färgar vit plast. Ljusets riktning och
 * styrka behålls — både rasterbilden och strålspårningen ljuses av den.
 */
export function StudioEnvironment({ intensity }: { intensity: number }) {
  const source = useLoader(HDRLoader, HDRI, configure) as DataTexture;

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
