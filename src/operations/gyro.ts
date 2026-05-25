import { type Polyhedron } from "../geometry/polyhedron";
import { type MorphPlan } from "./types";

/**
 * PHASE 2 — Gyro (Shift + drag a 2n-gon face).
 *
 * Not yet implemented. Disabled via `config.features.operations.gyro`.
 *
 * Intended behaviour: break the new vertex into n degree-3 vertices around a
 * degree-n vertex (or a single edge when n=2). The mouse snaps to the new edges
 * at the degree-n vertex; the dragged edge gets a new degree-3 vertex, so moving
 * to an adjacent edge yields the opposite chiral form.
 */
export function buildGyro(
  _poly: Polyhedron,
  _draggedFid: number,
  _selected: Set<number> | null,
): MorphPlan {
  throw new Error("Gyro is not implemented yet (Phase 2).");
}
