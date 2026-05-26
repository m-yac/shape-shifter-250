import { Vector3, Ray } from "three";
import {
  type Mesh,
  type DCEL,
  outgoingHalfEdges,
  vertexDegree,
} from "../geometry/HalfEdge";
import { type Polyhedron } from "../geometry/polyhedron";
import { type MorphPlan } from "./types";
import { weldVertexPairs } from "./weld";
import { closestLineParam, distancePointToRay } from "../util/lines";

// Cut fraction along an edge that an "outer" (triangle-only) cut vertex reaches at
// t=1, and the smaller fraction the "inner" (n-gon) cut vertices reach. The gap is
// what skews the truncated 2n-gon into the snub form. They sum to 1 so that at t=1
// the outer cut vertex from one end of an edge exactly meets the inner cut vertex
// from the other end — the welded max (e.g. snub of the octahedron → icosahedron).
const F_OUT = 0.65;
const F_IN = 0.35;

/**
 * Proper 2-coloring of the faces (adjacent faces get opposite colors). This exists
 * iff every vertex has even degree (the polyhedron is Eulerian) — exactly the
 * condition snub requires — so when all vertices are snubbed it never conflicts.
 * `coherent` reports whether the coloring closed without contradiction; if not
 * (e.g. a partial selection leaving odd vertices) we fall back to a per-vertex
 * parity, which still yields a valid (if less uniformly twisted) solid.
 */
function twoColorFaces(dcel: DCEL): { color: Map<number, 0 | 1>; coherent: boolean } {
  const color = new Map<number, 0 | 1>();
  let coherent = true;
  for (const f0 of dcel.faces) {
    if (color.has(f0.id)) continue;
    color.set(f0.id, 0);
    const queue = [f0];
    while (queue.length) {
      const f = queue.shift()!;
      const c = color.get(f.id)!;
      let h = f.halfedge;
      const start = h;
      do {
        if (h.twin) {
          const g = h.twin.face;
          const gc = color.get(g.id);
          if (gc === undefined) {
            color.set(g.id, (c ^ 1) as 0 | 1);
            queue.push(g);
          } else if (gc === c) {
            coherent = false;
          }
        }
        h = h.next;
      } while (h !== start);
    }
  }
  return { color, coherent };
}

/**
 * Snub ↔ (no max), driven by Shift + dragging a degree-2n vertex inward along an
 * edge.
 *
 * Model: like Truncate, BY DEFAULT every vertex participates (the dragged vertex is
 * the handle); a multi-select restricts the set. Each participating vertex must have
 * EVEN degree — otherwise the surrounding cut vertices can't be split into a clean
 * alternation, so we throw (the controller turns that into a no-op).
 *
 * Truncating a degree-2n vertex exposes a 2n-gon of cut vertices. Snub splits that
 * ring into a central n-gon (the "inner" alternating cut vertices) surrounded by n
 * "ear" triangles (around the "outer" cut vertices) — or, when n=2, just the two
 * triangles sharing the diagonal (no central 2-gon). Dragging skews it: outer cut
 * vertices slide outward along their edges, inner ones barely move, puckering the
 * flat truncation into the chiral snub form.
 *
 * Chirality (which alternating subset is "outer") is taken from a global face
 * 2-coloring so the whole solid twists coherently; it always exists because every
 * vertex is even (see `twoColorFaces`).
 */
export function buildSnub(
  poly: Polyhedron,
  draggedVid: number,
  selected: Set<number> | null,
): MorphPlan {
  const dcel = poly.dcel;

  const snubbed = new Set<number>(
    selected && selected.size > 0 ? selected : dcel.vertices.map((v) => v.id),
  );
  snubbed.add(draggedVid); // the handle always participates

  for (const id of snubbed) {
    if (vertexDegree(dcel.vertices[id]) % 2 !== 0) {
      throw new Error("Snub needs every participating vertex to have even degree.");
    }
  }

  // ---- Chirality: outer = cut verts whose half-edge sits on an `outerColor` face --
  const { color, coherent } = twoColorFaces(dcel);
  // Seed the global handedness so the dragged vertex's first edge is "outer".
  const outerColor = coherent
    ? color.get(outgoingHalfEdges(dcel.vertices[draggedVid])[0].face.id)!
    : 0;

  // Per snubbed vertex: the parity offset that makes outer cut verts alternate. With
  // the coloring, outer = half-edges at indices where the face color matches.
  const outerHe = new Set<number>(); // half-edge ids whose cut vertex is "outer"
  for (const id of snubbed) {
    const H = outgoingHalfEdges(dcel.vertices[id]);
    const phase = coherent && color.get(H[0].face.id) === outerColor ? 0 : 1;
    for (let k = 0; k < H.length; k++) {
      if (k % 2 === phase) outerHe.add(H[k].id);
    }
  }

  // ---- Index new vertices (one cut vertex per snubbed-origin half-edge) -----------
  const cutIndex = new Map<number, number>(); // halfedge id -> new vertex index
  const keepIndex = new Map<number, number>(); // old vertex id -> new vertex index
  let idx = 0;
  for (const he of dcel.halfedges) {
    if (snubbed.has(he.origin.id)) cutIndex.set(he.id, idx++);
  }
  for (const v of dcel.vertices) {
    if (!snubbed.has(v.id)) keepIndex.set(v.id, idx++);
  }
  const vertexCount = idx;

  const cutEnds: Array<{
    index: number;
    origin: Vector3;
    dest: Vector3;
    outer: boolean;
  }> = [];
  for (const he of dcel.halfedges) {
    const i = cutIndex.get(he.id);
    if (i === undefined) continue;
    cutEnds.push({
      index: i,
      origin: he.origin.position,
      dest: he.next.origin.position,
      outer: outerHe.has(he.id),
    });
  }
  const keepEnds: Array<{ index: number; pos: Vector3 }> = [];
  for (const v of dcel.vertices) {
    const i = keepIndex.get(v.id);
    if (i !== undefined) keepEnds.push({ index: i, pos: v.position });
  }

  // ---- Weld pairs for the max end -------------------------------------------------
  // On every edge with both ends snubbed, one cut vertex is outer and the other
  // inner (the coloring guarantees opposite roles); with F_OUT + F_IN = 1 they
  // coincide at t=1, and welding them collapses the edge — exactly "the long
  // vertices join with the short vertices" (e.g. snub octahedron → icosahedron).
  const weldPairs: Array<[number, number]> = [];
  for (const he of dcel.halfedges) {
    if (!he.twin || he.id >= he.twin.id) continue; // once per undirected edge
    const a = cutIndex.get(he.id);
    const b = cutIndex.get(he.twin.id);
    if (a !== undefined && b !== undefined) weldPairs.push([a, b]);
  }

  function positions(t: number): Vector3[] {
    const out: Vector3[] = new Array(vertexCount);
    const fOut = t * F_OUT;
    const fIn = t * F_IN;
    for (const c of cutEnds) {
      out[c.index] = c.origin.clone().lerp(c.dest, c.outer ? fOut : fIn);
    }
    for (const k of keepEnds) out[k.index] = k.pos.clone();
    return out;
  }

  // ---- Build the (un-welded) snub faces -------------------------------------------
  const previewFaces: number[][] = [];

  // (a) one polygon per original face — identical to truncate's truncated face.
  for (const f of dcel.faces) {
    const loop: number[] = [];
    let h = f.halfedge;
    const start = h;
    do {
      const v = h.origin;
      if (snubbed.has(v.id)) {
        loop.push(cutIndex.get(h.prev.twin!.id)!); // incoming cut
        loop.push(cutIndex.get(h.id)!); // outgoing cut
      } else {
        loop.push(keepIndex.get(v.id)!);
      }
      h = h.next;
    } while (h !== start);
    previewFaces.push(loop);
  }

  // (b) per snubbed vertex: central n-gon (inner cut verts) + n ear triangles.
  for (const v of dcel.vertices) {
    if (!snubbed.has(v.id)) continue;
    const H = outgoingHalfEdges(v);
    const m = H.length; // = 2n
    const c = H.map((h) => cutIndex.get(h.id)!);

    const ngon: number[] = [];
    for (let k = 0; k < m; k++) {
      if (!outerHe.has(H[k].id)) ngon.push(c[k]); // inner ones
    }
    if (ngon.length >= 3) previewFaces.push(ngon); // skip the degenerate 2-gon (n=2)

    for (let k = 0; k < m; k++) {
      if (!outerHe.has(H[k].id)) continue; // ear around each outer cut vert
      previewFaces.push([c[(k - 1 + m) % m], c[k], c[(k + 1) % m]]);
    }
  }

  // ---- Snapping: drag along the closest OUTER edge of the handle ------------------
  const draggedV = dcel.vertices[draggedVid];
  const outerEdges = outgoingHalfEdges(draggedV).filter((h) => outerHe.has(h.id));

  function snap(ray: Ray): {
    t: number;
    point: Vector3;
    highlight?: { a: Vector3; b: Vector3 };
  } {
    let best: { point: Vector3; max: Vector3; frac: number; dist: number } | null =
      null;
    for (const h of outerEdges) {
      const from = h.origin.position;
      const edge = h.next.origin.position.clone().sub(from);
      let frac = closestLineParam(from, edge, ray.origin, ray.direction);
      frac = Math.max(0, Math.min(F_OUT, frac));
      const point = from.clone().add(edge.clone().multiplyScalar(frac));
      const dist = distancePointToRay(point, ray);
      if (!best || dist < best.dist) {
        best = {
          point,
          max: from.clone().add(edge.clone().multiplyScalar(F_OUT)),
          frac,
          dist,
        };
      }
    }
    if (!best) {
      const p = draggedV.position.clone();
      return { t: 0, point: p, highlight: { a: p, b: p.clone() } };
    }
    const t = Math.max(0, Math.min(1, best.frac / F_OUT));
    return { t, point: best.point, highlight: { a: best.point.clone(), b: best.max } };
  }

  function commit(t: number, weld: boolean): Mesh {
    const mesh: Mesh = {
      vertices: positions(t),
      faces: previewFaces.map((f) => f.slice()),
    };
    return weld ? weldVertexPairs(mesh, weldPairs) : mesh;
  }

  return { kind: "snub", previewFaces, positions, snap, commit };
}
