import { Vector3 } from "three";
import { Polyhedron } from "../geometry/polyhedron";
import { faceCentroidOf, newellNormal } from "../geometry/polyhedron";

/**
 * =============================================================================
 *  MESH EXPORT — the current polyhedron as a binary STL.
 * =============================================================================
 *
 *  Each (possibly non-triangular, possibly slightly non-planar) face is fan-
 *  triangulated and written with that face's single outward Newell normal. The
 *  winding is flipped to outward the same way the renderer does (a face's outward
 *  direction is its centroid direction, since the solid is centered at the origin).
 * =============================================================================
 */

/** Build a binary-STL Blob from a polyhedron's current (solved) geometry. */
export function polyhedronToStl(poly: Polyhedron): Blob {
  const verts = poly.vertices;
  const tris: Array<{ n: Vector3; a: Vector3; b: Vector3; c: Vector3 }> = [];

  for (const f of poly.faces) {
    const n = newellNormal(f.map((i) => verts[i]));
    const loop = n.dot(faceCentroidOf(verts, f)) < 0 ? [...f].reverse() : f;
    if (loop !== f) n.negate();
    const p0 = verts[loop[0]];
    for (let i = 1; i < loop.length - 1; i++) {
      tris.push({ n, a: p0, b: verts[loop[i]], c: verts[loop[i + 1]] });
    }
  }

  // Binary STL: 80-byte header + uint32 triangle count + 50 bytes per triangle.
  const buffer = new ArrayBuffer(84 + tris.length * 50);
  const view = new DataView(buffer);
  view.setUint32(80, tris.length, true);
  let o = 84;
  const put = (v: Vector3) => {
    view.setFloat32(o, v.x, true);
    view.setFloat32(o + 4, v.y, true);
    view.setFloat32(o + 8, v.z, true);
    o += 12;
  };
  for (const t of tris) {
    put(t.n);
    put(t.a);
    put(t.b);
    put(t.c);
    view.setUint16(o, 0, true); // attribute byte count
    o += 2;
  }
  return new Blob([buffer], { type: "model/stl" });
}
