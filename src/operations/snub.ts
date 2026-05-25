import { type Polyhedron } from "../geometry/polyhedron";
import { type MorphPlan } from "./types";

/**
 * PHASE 2 — Snub (Shift + drag a degree-2n vertex).
 *
 * Not yet implemented. Disabled via `config.features.operations.snub`. The drag
 * controller never reaches this while the flag is off; the signature is fixed so
 * Phase 2 can fill it in without touching the controller.
 *
 * Intended behaviour: break the new vertex's surrounding face into n triangles
 * around an n-gon (or a single edge when n=2). Dragging along an edge skews the
 * triangle/n-gon proportions; the dragged edge is forced into a triangle, so
 * moving to an adjacent edge yields the opposite chiral form.
 */
export function buildSnub(
  _poly: Polyhedron,
  _draggedVid: number,
  _selected: Set<number> | null,
): MorphPlan {
  throw new Error("Snub is not implemented yet (Phase 2).");
}
