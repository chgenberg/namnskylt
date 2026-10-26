import { buildBadgeGeometry } from "./geometry";
import { toArrays, transferList, type GeometryRequest, type GeometryResponse } from "./geometry-arrays";

interface WorkerScope {
  onmessage: ((event: MessageEvent<GeometryRequest>) => void) | null;
  postMessage(message: GeometryResponse, transfer: Transferable[]): void;
}

const scope = self as unknown as WorkerScope;

/** Fräser gravyren (CSG) utanför huvudtråden, så sidan inte fryser under bygget. */
scope.onmessage = ({ data: { id, doc, engraving } }) => {
  try {
    const parts = buildBadgeGeometry(doc, engraving);
    const arrays = toArrays(parts);
    parts.forEach((part) => part.dispose());
    scope.postMessage({ id, arrays }, transferList(arrays));
  } catch (error) {
    scope.postMessage({ id, error: error instanceof Error ? error.message : String(error) }, []);
  }
};
