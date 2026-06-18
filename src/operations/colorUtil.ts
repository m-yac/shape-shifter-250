import { Color } from "three";
import {
  type HEVertex,
  type HEFace,
  outgoingHalfEdges,
} from "../geometry/HalfEdge";
import { type ColorSet, edgeKey, paletteRGB } from "../geometry/colors";

/**
 * Shared color-propagation helpers for the Conway operations. Each operation
 * reads the OLD `ColorSet` and assigns new colors per the rules in the plan:
 * new center face/vertex ← original vertex/face color; new vertices/faces ←
 * the original edge they replace; new edges ← one more than the max color among
 * everything adjacent to (and including) the original vertex/face.
 */

/** `c` = max color among vertex `v`, its incident edges, and its incident faces
 *  (including the vertex itself). The operation rules build c+1/c+2/c+3 from this. */
export function vertexMax(v: HEVertex, old: ColorSet): number {
  let m = old.vertex[v.id];
  for (const h of outgoingHalfEdges(v)) {
    const e = old.edge.get(edgeKey(h.origin.id, h.next.origin.id));
    if (e !== undefined) m = Math.max(m, e);
    m = Math.max(m, old.face[h.face.id]);
  }
  return m;
}

/** `c` = max color among face `f`, its boundary edges, and its boundary vertices
 *  (including the face itself). The operation rules build c+1/c+2/c+3 from this. */
export function faceMax(f: HEFace, old: ColorSet): number {
  let m = old.face[f.id];
  let h = f.halfedge;
  const start = h;
  do {
    const e = old.edge.get(edgeKey(h.origin.id, h.next.origin.id));
    if (e !== undefined) m = Math.max(m, e);
    m = Math.max(m, old.vertex[h.origin.id]);
    h = h.next;
  } while (h !== start);
  return m;
}

/** 1 + max color around vertex `v` (the truncate/snub new-edge color, c+1). */
export function vertexMaxPlus1(v: HEVertex, old: ColorSet): number {
  return vertexMax(v, old) + 1;
}

/** 1 + max color around face `f` (the kis/gyro new-edge color, c+1). */
export function faceMaxPlus1(f: HEFace, old: ColorSet): number {
  return faceMax(f, old) + 1;
}

/** Per-face RGB interpolated from each face's t=0 color to its limit color. */
export function lerpFaceColors(
  startIdx: number[],
  endIdx: number[],
  t: number,
): Color[] {
  const k = Math.max(0, Math.min(1, t));
  const out: Color[] = new Array(startIdx.length);
  for (let i = 0; i < startIdx.length; i++) {
    out[i] = paletteRGB(startIdx[i]).lerp(paletteRGB(endIdx[i]), k);
  }
  return out;
}
