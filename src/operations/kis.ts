import { Vector3, Ray, Color } from "three";
import { type Mesh, type HEFace } from "../geometry/HalfEdge";
import { type Polyhedron } from "../geometry/polyhedron";
import { faceCentroidHE, faceNormalHE } from "../geometry/polyhedron";
import { type ColorSet, edgeKey } from "../geometry/colors";
import { type MorphPlan } from "./types";
import { faceMaxPlus1, lerpFaceColors } from "./colorUtil";
import { closestLineParam } from "../util/lines";

/** Smallest strictly-positive root of A h² + B h + C, or null. */
export function smallestPositiveRoot(A: number, B: number, C: number): number | null {
  if (Math.abs(A) < 1e-12) {
    if (Math.abs(B) < 1e-12) return null;
    const h = -C / B;
    return h > 1e-9 ? h : null;
  }
  const disc = B * B - 4 * A * C;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  const candidates = [(-B - sq) / (2 * A), (-B + sq) / (2 * A)].filter(
    (h) => h > 1e-9,
  );
  return candidates.length ? Math.min(...candidates) : null;
}

/**
 * The apex height at which the two pyramid triangles straddling edge (P1,P2)
 * become coplanar (so they merge into one quad — i.e. Join). Both apexes are
 * C_f = c_f + h*n_f and C_g = c_g + h*n_g; we require P1,P2,C_f,C_g coplanar.
 */
export function joinHeight(
  P1: Vector3,
  P2: Vector3,
  cf: Vector3,
  nf: Vector3,
  cg: Vector3,
  ng: Vector3,
): number | null {
  const w = P2.clone().sub(P1);
  const uf = cf.clone().sub(P1);
  const ug = cg.clone().sub(P1);
  const A = nf.dot(new Vector3().crossVectors(w, ng));
  const B =
    uf.dot(new Vector3().crossVectors(w, ng)) +
    nf.dot(new Vector3().crossVectors(w, ug));
  const C = uf.dot(new Vector3().crossVectors(w, ug));
  return smallestPositiveRoot(A, B, C);
}

function faceLoop(f: HEFace): number[] {
  const loop: number[] = [];
  let h = f.halfedge;
  const start = h;
  do {
    loop.push(h.origin.id);
    h = h.next;
  } while (h !== start);
  return loop;
}

/**
 * Kis ↔ Join, driven by dragging a face center outward along its normal.
 *
 * Model: BY DEFAULT every face is kissed (a pyramid raised on each); the dragged
 * face is the handle setting the global height fraction. At t=1 every apex reaches
 * its join height and adjacent triangles merge into quads → Join.
 */
export function buildKis(
  poly: Polyhedron,
  draggedFid: number,
  selected: Set<number> | null,
): MorphPlan {
  const dcel = poly.dcel;
  const V = dcel.vertices.length;

  const kissed = new Set<number>(
    selected && selected.size > 0 ? selected : dcel.faces.map((f) => f.id),
  );
  kissed.add(draggedFid);

  // Per kissed face: centroid, outward normal, join height, apex vertex index.
  interface KFace {
    id: number;
    centroid: Vector3;
    normal: Vector3;
    hJoin: number;
    apex: number;
  }
  const kfaces = new Map<number, KFace>();
  let apexIdx = V;
  for (const f of dcel.faces) {
    if (!kissed.has(f.id)) continue;
    const centroid = faceCentroidHE(f);
    const normal = faceNormalHE(f);
    // Join height = apex rise at which a pyramid triangle becomes coplanar with its
    // neighbour's (so they merge into a quad). Only edges shared with ANOTHER kissed
    // face actually merge, so take the LARGEST such height — that way every mergeable
    // edge has reached (or passed) coplanarity, i.e. the faces visibly join. (Using
    // one representative edge under-rises on irregular solids / partial selections.)
    let hJoin = 0;
    let he = f.halfedge;
    const start = he;
    do {
      const g = he.twin!.face;
      if (kissed.has(g.id)) {
        const solved = joinHeight(
          he.origin.position,
          he.next.origin.position,
          centroid,
          normal,
          faceCentroidHE(g),
          faceNormalHE(g),
        );
        if (solved && solved > 1e-6) hJoin = Math.max(hJoin, solved);
      }
      he = he.next;
    } while (he !== start);
    // Fallback (e.g. an isolated kissed face with no kissed neighbours, so nothing
    // merges): half the centroid->vertex distance, so the handle still has a max.
    if (hJoin <= 1e-6) hJoin = 0.5 * centroid.distanceTo(f.halfedge.origin.position);
    kfaces.set(f.id, { id: f.id, centroid, normal, hJoin, apex: apexIdx++ });
  }
  const apexCount = apexIdx - V;

  function positions(t: number): Vector3[] {
    const out: Vector3[] = new Array(V + apexCount);
    for (let i = 0; i < V; i++) out[i] = dcel.vertices[i].position.clone();
    for (const kf of kfaces.values()) {
      out[kf.apex] = kf.centroid
        .clone()
        .add(kf.normal.clone().multiplyScalar(t * kf.hJoin));
    }
    return out;
  }

  // Preview topology: pyramids (triangles) on kissed faces, others unchanged.
  const previewFaces: number[][] = [];
  for (const f of dcel.faces) {
    const loop = faceLoop(f);
    const kf = kfaces.get(f.id);
    if (!kf) {
      previewFaces.push(loop);
      continue;
    }
    for (let i = 0; i < loop.length; i++) {
      previewFaces.push([loop[i], loop[(i + 1) % loop.length], kf.apex]);
    }
  }

  // ---- Colors (dual of truncate) --------------------------------------------
  // New apex vertex ← its face's color; original vertices keep their color. New
  // pyramid faces ← the original (base) edge they straddle, animating out of the
  // flat face color. New (lateral) edges ← 1 + max adjacent to the original face.
  const old = poly.colors;
  const vertexColor: number[] = new Array(V + apexCount);
  for (let i = 0; i < V; i++) vertexColor[i] = old.vertex[i];
  for (const kf of kfaces.values()) vertexColor[kf.apex] = old.face[kf.id];

  const faceColor: number[] = [];
  const faceStart: number[] = [];
  for (const f of dcel.faces) {
    const loop = faceLoop(f);
    const kf = kfaces.get(f.id);
    if (!kf) {
      faceColor.push(old.face[f.id]);
      faceStart.push(old.face[f.id]);
      continue;
    }
    for (let i = 0; i < loop.length; i++) {
      const base = old.edge.get(edgeKey(loop[i], loop[(i + 1) % loop.length])) ?? 0;
      faceColor.push(base); // each triangle → its base edge color (rhombus at Join)
      faceStart.push(old.face[f.id]); // ...emerging from the flat face color
    }
  }

  const edgeColor = new Map<string, number>();
  for (const [k, c] of old.edge) edgeColor.set(k, c); // original edges keep their color
  for (const f of dcel.faces) {
    const kf = kfaces.get(f.id);
    if (!kf) continue;
    const mp = faceMaxPlus1(f, old);
    for (const u of faceLoop(f)) edgeColor.set(edgeKey(u, kf.apex), mp);
  }

  // Base edges that dissolve at Join (shared by two kissed faces).
  const joinDissolve: Array<[number, number]> = [];
  for (const he of dcel.halfedges) {
    if (!he.twin || he.id >= he.twin.id) continue;
    if (kfaces.has(he.face.id) && kfaces.has(he.twin.face.id)) {
      joinDissolve.push([he.origin.id, he.next.origin.id]);
    }
  }

  function previewFaceColors(t: number): Color[] {
    return lerpFaceColors(faceStart, faceColor, t);
  }

  // Join topology: merge adjacent kissed-face triangles across each shared edge
  // into one quad; triangles bordering a non-kissed face stay as triangles. Each
  // merged/border face ← the original (base) edge it replaces; untouched faces
  // keep their color.
  function joinFaces(): { faces: number[][]; faceColors: number[] } {
    const faces: number[][] = [];
    const faceColors: number[] = [];
    const emitted = new Set<number>();
    for (const f of dcel.faces) {
      const kf = kfaces.get(f.id);
      if (!kf) {
        faces.push(faceLoop(f));
        faceColors.push(old.face[f.id]);
        continue;
      }
      let h = f.halfedge;
      const start = h;
      do {
        const a = h.origin.id;
        const b = h.next.origin.id;
        const baseColor = old.edge.get(edgeKey(a, b)) ?? 0;
        const g = h.twin!.face;
        const kg = kfaces.get(g.id);
        if (kg) {
          const key = Math.min(h.id, h.twin!.id);
          if (!emitted.has(key)) {
            emitted.add(key);
            faces.push([a, kf.apex, b, kg.apex]); // the merged rhombus/kite
            faceColors.push(baseColor);
          }
        } else {
          faces.push([a, b, kf.apex]); // border triangle (partial selection)
          faceColors.push(baseColor);
        }
        h = h.next;
      } while (h !== start);
    }
    return { faces, faceColors };
  }

  // Edge colors for the Join form: the un-welded edges minus the dissolved bases.
  function joinEdges(): Map<string, number> {
    const edge = new Map(edgeColor);
    for (const [a, b] of joinDissolve) edge.delete(edgeKey(a, b));
    return edge;
  }

  // Snap the ray to the dragged face's outward normal line.
  const dragged = kfaces.get(draggedFid)!;
  function snap(ray: Ray): {
    t: number;
    point: Vector3;
    highlight?: { a: Vector3; b: Vector3 };
  } {
    let s = closestLineParam(
      dragged.centroid,
      dragged.normal,
      ray.origin,
      ray.direction,
    );
    s = Math.max(0, Math.min(dragged.hJoin, s));
    const point = dragged.centroid
      .clone()
      .add(dragged.normal.clone().multiplyScalar(s));
    const t = Math.max(0, Math.min(1, s / dragged.hJoin));
    // Orange range line: from the current apex to the join (max) point.
    return {
      t,
      point,
      highlight: {
        a: point.clone(),
        b: dragged.centroid
          .clone()
          .add(dragged.normal.clone().multiplyScalar(dragged.hJoin)),
      },
    };
  }

  function commit(t: number, weld: boolean): { mesh: Mesh; colors: ColorSet } {
    if (weld) {
      const { faces, faceColors } = joinFaces();
      return {
        mesh: { vertices: positions(t), faces },
        colors: { vertex: vertexColor.slice(), face: faceColors, edge: joinEdges() },
      };
    }
    return {
      mesh: { vertices: positions(t), faces: previewFaces.map((f) => f.slice()) },
      colors: {
        vertex: vertexColor.slice(),
        face: faceColor.slice(),
        edge: new Map(edgeColor),
      },
    };
  }

  return {
    kind: "kis",
    previewFaces,
    positions,
    previewFaceColors,
    previewEdgeColors: edgeColor,
    vanishingEdges: joinDissolve,
    snap,
    commit,
  };
}
