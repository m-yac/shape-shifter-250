import { Vector3, Ray } from "three";
import {
  type Mesh,
  type DCEL,
  type HEFace,
  type HalfEdge,
  faceOrder,
} from "../geometry/HalfEdge";
import { type Polyhedron, faceCentroidHE, faceNormalHE } from "../geometry/polyhedron";
import { type MorphPlan } from "./types";
import { closestLineParam } from "../util/lines";

/** Half-edges around a face, in order. */
function faceHalfEdges(f: HEFace): HalfEdge[] {
  const out: HalfEdge[] = [];
  let h = f.halfedge;
  const start = h;
  do {
    out.push(h);
    h = h.next;
  } while (h !== start);
  return out;
}

function faceLoop(f: HEFace): number[] {
  return faceHalfEdges(f).map((h) => h.origin.id);
}

/**
 * Proper 2-coloring of the VERTICES (adjacent vertices get opposite colors). Exists
 * iff the graph is bipartite, which (for a polyhedron) holds iff every face has an
 * even number of sides — exactly the condition gyro requires. `bipartite` reports
 * whether it closed without contradiction; if not (e.g. a partial selection leaving
 * odd faces) we fall back to a per-face start, which still yields a valid solid.
 */
function twoColorVertices(dcel: DCEL): { color: Map<number, 0 | 1>; bipartite: boolean } {
  const color = new Map<number, 0 | 1>();
  let bipartite = true;
  for (const v0 of dcel.vertices) {
    if (color.has(v0.id)) continue;
    color.set(v0.id, 0);
    const queue = [v0.id];
    while (queue.length) {
      const vid = queue.shift()!;
      const c = color.get(vid)!;
      let h = dcel.vertices[vid].halfedge;
      const start = h;
      do {
        const n = h.next.origin.id; // neighbour across this outgoing edge
        const nc = color.get(n);
        if (nc === undefined) {
          color.set(n, (c ^ 1) as 0 | 1);
          queue.push(n);
        } else if (nc === c) {
          bipartite = false;
        }
        if (!h.twin) break;
        h = h.twin.next;
      } while (h !== start);
    }
  }
  return { color, bipartite };
}

/** Are the selected faces edge-connected to one another? */
function selectionConnected(dcel: DCEL, gyred: Set<number>): boolean {
  if (gyred.size <= 1) return true;
  const start = gyred.values().next().value as number;
  const seen = new Set<number>([start]);
  const queue = [start];
  while (queue.length) {
    const f = dcel.faces[queue.shift()!];
    for (const h of faceHalfEdges(f)) {
      const g = h.twin?.face.id;
      if (g !== undefined && gyred.has(g) && !seen.has(g)) {
        seen.add(g);
        queue.push(g);
      }
    }
  }
  return seen.size === gyred.size;
}

/**
 * Gyro ↔ (no max), driven by Shift + dragging a 2n-gon face outward along its normal.
 *
 * Model: the dual of Snub. Like Kis, BY DEFAULT every face participates (the dragged
 * face is the handle); a multi-select restricts the set (and must be connected).
 * Each participating face must have an EVEN number of sides — otherwise it can't be
 * tiled into the alternating pattern below — so we throw (the controller makes that
 * a no-op).
 *
 * A 2n-gon face is replaced by a central degree-n vertex C surrounded by n degree-3
 * peripheral vertices, tiled into n pentagons (meeting at C) and n triangles that
 * alternate around the boundary so every original edge stays a shared p–p edge. When
 * n=2 the central vertex degenerates to "just an edge", so C is dropped and each face
 * becomes 2 quads + 2 triangles. Dragging raises the cap along the face normal.
 *
 * Chirality (where the peripheral vertices sit) is taken from a global vertex
 * 2-coloring so the whole solid twists coherently; it always exists because every
 * face is even-sided (see `twoColorVertices`).
 */
export function buildGyro(
  poly: Polyhedron,
  draggedFid: number,
  selected: Set<number> | null,
): MorphPlan {
  const dcel = poly.dcel;
  const V = dcel.vertices.length;

  const gyred = new Set<number>(
    selected && selected.size > 0 ? selected : dcel.faces.map((f) => f.id),
  );
  gyred.add(draggedFid); // the handle always participates

  for (const id of gyred) {
    if (faceOrder(dcel.faces[id]) % 2 !== 0) {
      throw new Error("Gyro needs every participating face to have an even number of sides.");
    }
  }
  if (!selectionConnected(dcel, gyred)) {
    throw new Error("Gyro needs the selected faces to be connected.");
  }

  const { color, bipartite } = twoColorVertices(dcel);

  // Per gyred face: the central apex (n>=3), the n peripheral vertices with their
  // resting (fully-extended) in-plane positions, and the boundary tiling.
  interface GFace {
    centroid: Vector3;
    normal: Vector3;
    scale: number; // centroid → edge-midpoint distance (the in-plane size of the cap)
    center: number; // apex vertex index, or -1 when n=2 (collapsed to an edge)
    qIdx: number[]; // peripheral vertex indices q_0..q_{n-1}
    qRest: Vector3[]; // edge midpoints the peripherals head toward (before INSET)
  }
  const gfaces: GFace[] = [];
  const previewFaces: number[][] = [];
  let idx = V;

  for (const f of dcel.faces) {
    if (!gyred.has(f.id)) {
      previewFaces.push(faceLoop(f)); // untouched face
      continue;
    }
    const bh = faceHalfEdges(f);
    const m = bh.length; // = 2n
    const n = m / 2;

    // Start the boundary order at a "color 0" vertex so the pentagon/triangle
    // assignment is consistent across shared edges (coherent chirality).
    let s = 0;
    if (bipartite) {
      for (let i = 0; i < m; i++) {
        if (color.get(bh[i].origin.id) === 0) {
          s = i;
          break;
        }
      }
    }
    const P: number[] = []; // boundary vertex ids p_0..p_{2n-1}
    for (let i = 0; i < m; i++) P.push(bh[(s + i) % m].origin.id);

    const centroid = faceCentroidHE(f);
    const normal = faceNormalHE(f);

    const hasCenter = n >= 3;
    const center = hasCenter ? idx++ : -1;
    const qIdx: number[] = [];
    const qRest: Vector3[] = [];
    for (let j = 0; j < n; j++) {
      qIdx.push(idx++);
      // q_j heads toward the midpoint of edge (p_{2j-1}, p_{2j}).
      const a = dcel.vertices[P[(2 * j - 1 + m) % m]].position;
      const b = dcel.vertices[P[2 * j]].position;
      qRest.push(a.clone().add(b).multiplyScalar(0.5));
    }
    const scale = centroid.distanceTo(qRest[0]);

    for (let j = 0; j < n; j++) {
      const pent = hasCenter
        ? [center, qIdx[j], P[2 * j], P[2 * j + 1], qIdx[(j + 1) % n]]
        : [qIdx[j], P[2 * j], P[2 * j + 1], qIdx[(j + 1) % n]];
      previewFaces.push(pent);
      previewFaces.push([qIdx[(j + 1) % n], P[2 * j + 1], P[(2 * j + 2) % m]]);
    }

    gfaces.push({ centroid, normal, scale, center, qIdx, qRest });
  }
  const vertexCount = idx;

  // ---- Welded max: dissolve every original edge shared by two gyred faces ---------
  // Each tiling face owns exactly one such boundary edge; across it sit a
  // pentagon/quad (one face) and a triangle (the neighbour), which merge into one
  // larger face — quad+triangle → pentagon, giving gyro of the cube → dodecahedron.
  const edgeKey = (a: number, b: number) => (a < b ? `${a}_${b}` : `${b}_${a}`);
  const dissolve = new Set<string>();
  for (const he of dcel.halfedges) {
    if (!he.twin || he.id >= he.twin.id) continue;
    if (gyred.has(he.face.id) && gyred.has(he.twin.face.id)) {
      dissolve.add(edgeKey(he.origin.id, he.next.origin.id));
    }
  }

  function weldedFaces(): number[][] {
    // Where does each dissolved edge appear (as a consecutive original-vertex pair)?
    const occ = new Map<string, Array<{ fi: number; i: number }>>();
    for (let fi = 0; fi < previewFaces.length; fi++) {
      const loop = previewFaces[fi];
      for (let i = 0; i < loop.length; i++) {
        const a = loop[i];
        const b = loop[(i + 1) % loop.length];
        if (a < V && b < V && dissolve.has(edgeKey(a, b))) {
          (occ.get(edgeKey(a, b)) ?? occ.set(edgeKey(a, b), []).get(edgeKey(a, b))!).push({ fi, i });
        }
      }
    }
    const consumed = new Set<number>();
    const out: number[][] = [];
    for (const list of occ.values()) {
      if (list.length !== 2) continue; // boundary of a partial selection: leave intact
      const [F, G] = list;
      consumed.add(F.fi);
      consumed.add(G.fi);
      const lf = previewFaces[F.fi];
      const lg = previewFaces[G.fi];
      const a = lf[F.i]; // F: [a, b, ...fRest];  G traverses b->a: [b, a, ...gRest]
      const b = lf[(F.i + 1) % lf.length];
      const fRest: number[] = [];
      for (let k = 2; k < lf.length; k++) fRest.push(lf[(F.i + k) % lf.length]);
      const gRest: number[] = [];
      for (let k = 2; k < lg.length; k++) gRest.push(lg[(G.i + k) % lg.length]);
      out.push([a, ...gRest, b, ...fRest]);
    }
    for (let fi = 0; fi < previewFaces.length; fi++) {
      if (!consumed.has(fi)) out.push(previewFaces[fi].slice());
    }
    return out;
  }

  // At the welded max the new vertices should land on the "join" configuration — for
  // the cube that is the regular dodecahedron, whose 12 extra vertices sit ~0.6 of the
  // way from each face centroid to the edge midpoints, lifted ~0.6 × that distance
  // along the normal (NOT all the way out at the edge midpoints). These fractions put
  // t=1 there, so the merged pentagons come out nearly planar before the solver runs.
  const INSET = 0.6; // in-plane fraction (centroid → edge midpoint) reached at t=1
  const RISE = 0.6; // normal lift at t=1, as a fraction of the centroid→edge-mid distance

  function positions(t: number): Vector3[] {
    const out: Vector3[] = new Array(vertexCount);
    for (let i = 0; i < V; i++) out[i] = dcel.vertices[i].position.clone();
    for (const g of gfaces) {
      // New verts spread out from the centroid toward (part-way to) the edge midpoints
      // while rising along the face normal. At t=0 they all sit at the centroid, so the
      // tiling reproduces the original solid (no preview "pop").
      const lift = g.normal.clone().multiplyScalar(t * RISE * g.scale);
      if (g.center >= 0) out[g.center] = g.centroid.clone().add(lift);
      for (let j = 0; j < g.qIdx.length; j++) {
        out[g.qIdx[j]] = g.centroid.clone().lerp(g.qRest[j], t * INSET).add(lift);
      }
    }
    return out;
  }

  // ---- Snapping: raise the dragged face's cap along its outward normal ------------
  const draggedCentroid = faceCentroidHE(dcel.faces[draggedFid]);
  const draggedNormal = faceNormalHE(dcel.faces[draggedFid]);
  const dh = dcel.faces[draggedFid].halfedge;
  const draggedScale = draggedCentroid.distanceTo(
    dh.origin.position.clone().add(dh.next.origin.position).multiplyScalar(0.5),
  );
  const draggedHMax = RISE * draggedScale; // cap height at the welded max

  function snap(ray: Ray): {
    t: number;
    point: Vector3;
    highlight?: { a: Vector3; b: Vector3 };
  } {
    let s = closestLineParam(draggedCentroid, draggedNormal, ray.origin, ray.direction);
    s = Math.max(0, Math.min(draggedHMax, s));
    const point = draggedCentroid
      .clone()
      .add(draggedNormal.clone().multiplyScalar(s));
    const t = draggedHMax > 1e-9 ? Math.max(0, Math.min(1, s / draggedHMax)) : 0;
    return {
      t,
      point,
      highlight: {
        a: point.clone(),
        b: draggedCentroid
          .clone()
          .add(draggedNormal.clone().multiplyScalar(draggedHMax)),
      },
    };
  }

  function commit(t: number, weld: boolean): Mesh {
    return {
      vertices: positions(t),
      faces: weld ? weldedFaces() : previewFaces.map((f) => f.slice()),
    };
  }

  return { kind: "gyro", previewFaces, positions, snap, commit };
}
