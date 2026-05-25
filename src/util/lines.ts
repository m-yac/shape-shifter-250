import { Vector3, Ray } from "three";

/**
 * Parameter `s` of the point on line `P + s*u` that is closest to the line
 * `Q + r*d` (e.g. the camera pick ray). Returns 0 when the lines are parallel.
 * `u` and `d` need not be unit length; `s` is expressed in units of `u`.
 */
export function closestLineParam(
  P: Vector3,
  u: Vector3,
  Q: Vector3,
  d: Vector3,
): number {
  const w0 = P.clone().sub(Q);
  const a = u.dot(u);
  const b = u.dot(d);
  const c = d.dot(d);
  const dd = u.dot(w0);
  const e = d.dot(w0);
  const denom = a * c - b * b;
  if (Math.abs(denom) < 1e-12) return 0;
  return (b * e - c * dd) / denom;
}

/** Perpendicular distance from a point to a ray's infinite line. */
export function distancePointToRay(point: Vector3, ray: Ray): number {
  const w = point.clone().sub(ray.origin);
  const proj = w.dot(ray.direction);
  const closest = ray.origin
    .clone()
    .add(ray.direction.clone().multiplyScalar(proj));
  return point.distanceTo(closest);
}
