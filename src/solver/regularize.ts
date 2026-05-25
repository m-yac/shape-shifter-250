import { Vector3 } from "three";
import { type Mesh } from "../geometry/HalfEdge";
import { faceCentroidOf, newellNormal } from "../geometry/polyhedron";

/**
 * Strategy 1 — REGULARIZE FACES.
 * Nudge every face toward a regular polygon inscribed in its own best-fit circle
 * (equal radii + equal angular spacing) using the best-fitting rotation. Shared
 * vertices get the average of their faces' targets. Returns the largest per-vertex
 * move this pass, relative to `radius`.
 */
export function regularizeFacesStep(
  mesh: Mesh,
  stepFactor: number,
  radius: number,
): number {
  const n = mesh.vertices.length;
  const disp = Array.from({ length: n }, () => new Vector3());
  const count = new Array<number>(n).fill(0);

  for (const face of mesh.faces) {
    const m = face.length;
    if (m < 3) continue;
    const c = faceCentroidOf(mesh.vertices, face);
    const normal = newellNormal(face.map((i) => mesh.vertices[i]));

    let e1 = mesh.vertices[face[0]].clone().sub(c);
    e1.addScaledVector(normal, -e1.dot(normal));
    if (e1.lengthSq() < 1e-18) continue;
    e1.normalize();
    const e2 = new Vector3().crossVectors(normal, e1);

    let R = 0;
    let sumSin = 0;
    let sumCos = 0;
    const step = (2 * Math.PI) / m;
    for (let k = 0; k < m; k++) {
      const d = mesh.vertices[face[k]].clone().sub(c);
      R += d.length();
      const phi = Math.atan2(d.dot(e2), d.dot(e1));
      sumSin += Math.sin(phi - k * step);
      sumCos += Math.cos(phi - k * step);
    }
    R /= m;
    const phase = Math.atan2(sumSin, sumCos);

    for (let k = 0; k < m; k++) {
      const theta = k * step + phase;
      const target = c
        .clone()
        .addScaledVector(e1, R * Math.cos(theta))
        .addScaledVector(e2, R * Math.sin(theta));
      const vi = face[k];
      disp[vi].add(target.sub(mesh.vertices[vi]).multiplyScalar(stepFactor));
      count[vi]++;
    }
  }
  return applyDisp(mesh, disp, count, radius);
}

/**
 * Strategy 2 — CANONICAL / DUAL (midsphere).
 * Push every edge so the point on it nearest the origin is the same distance
 * from the center (i.e. all edges tangent to a common sphere). This is the
 * classic canonical form: it makes both the polyhedron AND its dual well-shaped
 * (regular vertex figures), and — crucially — it is convex by construction, so
 * unlike face-regularization it never lets a face fall coplanar with a neighbour.
 * This is the right objective for Catalan-like solids whose faces are not regular.
 */
export function canonicalStep(
  mesh: Mesh,
  edges: Array<[number, number]>,
  stepFactor: number,
  radius: number,
): number {
  const n = mesh.vertices.length;

  // Pass 1: tangent point of each edge + their mean distance (the target).
  const tangents: Vector3[] = new Array(edges.length);
  let meanT = 0;
  for (let i = 0; i < edges.length; i++) {
    const pa = mesh.vertices[edges[i][0]];
    const pb = mesh.vertices[edges[i][1]];
    const d = pb.clone().sub(pa);
    let t = -pa.dot(d) / Math.max(d.dot(d), 1e-12);
    t = Math.max(0, Math.min(1, t));
    const T = pa.clone().add(d.multiplyScalar(t));
    tangents[i] = T;
    meanT += T.length();
  }
  meanT /= edges.length || 1;

  // Pass 2: nudge each edge's endpoints so its tangent distance approaches meanT.
  const disp = Array.from({ length: n }, () => new Vector3());
  const count = new Array<number>(n).fill(0);
  for (let i = 0; i < edges.length; i++) {
    const T = tangents[i];
    const r = T.length();
    if (r < 1e-9) continue;
    const move = T.clone().multiplyScalar(((meanT - r) / r) * stepFactor);
    const [a, b] = edges[i];
    disp[a].add(move);
    count[a]++;
    disp[b].add(move);
    count[b]++;
  }
  return applyDisp(mesh, disp, count, radius);
}

/**
 * Strategy 3 — SPHERIZE (last resort).
 * Pull every vertex toward the mean radius so they sit roughly evenly on a sphere
 * around the origin. Inflates a near-flat shape back to a convex blob.
 */
export function spherizeStep(mesh: Mesh, stepFactor: number, radius: number): number {
  let meanR = 0;
  for (const p of mesh.vertices) meanR += p.length();
  meanR /= mesh.vertices.length;

  let maxMove = 0;
  for (const p of mesh.vertices) {
    const r = p.length();
    if (r < 1e-9) continue;
    const move = p.clone().multiplyScalar((meanR / r - 1) * stepFactor);
    maxMove = Math.max(maxMove, move.length());
    p.add(move);
  }
  return radius > 0 ? maxMove / radius : maxMove;
}

/** Minimum angle (radians) between the normals of any two adjacent faces.
 *  Near 0 means two faces have drifted (almost) coplanar. */
export function minAdjacentFaceAngle(
  mesh: Mesh,
  edgeFaces: Array<[number, number]>,
): number {
  const normals = mesh.faces.map((f) => newellNormal(f.map((i) => mesh.vertices[i])));
  let minAng = Math.PI;
  for (const [a, b] of edgeFaces) {
    const d = Math.max(-1, Math.min(1, normals[a].dot(normals[b])));
    minAng = Math.min(minAng, Math.acos(d));
  }
  return minAng;
}

/**
 * Recenter the shape at the origin and EASE its scale so the average vertex
 * distance from the origin approaches `target` (by fraction `rate` each call).
 * This keeps the apparent size stable across edits — truncating no longer keeps
 * shrinking the solid, and kissing no longer keeps growing it. Returns the
 * average distance after this step (for the convergence check).
 */
export function normalizeStep(mesh: Mesh, target: number, rate: number): number {
  const c = new Vector3();
  for (const p of mesh.vertices) c.add(p);
  c.multiplyScalar(1 / mesh.vertices.length);
  for (const p of mesh.vertices) p.sub(c);

  let avg = 0;
  for (const p of mesh.vertices) avg += p.length();
  avg /= mesh.vertices.length;
  if (avg < 1e-9) return avg;

  const factor = 1 + (target / avg - 1) * rate;
  for (const p of mesh.vertices) p.multiplyScalar(factor);
  return avg * factor;
}

function applyDisp(
  mesh: Mesh,
  disp: Vector3[],
  count: number[],
  radius: number,
): number {
  let maxMove = 0;
  for (let i = 0; i < mesh.vertices.length; i++) {
    if (count[i] === 0) continue;
    const d = disp[i].multiplyScalar(1 / count[i]);
    maxMove = Math.max(maxMove, d.length());
    mesh.vertices[i].add(d);
  }
  return radius > 0 ? maxMove / radius : maxMove;
}
