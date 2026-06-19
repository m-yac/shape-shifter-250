import { type Polyhedron } from "../geometry/polyhedron";
import { type SchemeName } from "../geometry/colors";
import { namedPolyhedronFor } from "./namedPolyhedra";

/**
 * The colored solid + color scheme used to render a LIBRARY-diagram node. This is
 * now a thin adapter over the named-polyhedron database (`data/namedPolyhedra.ts`),
 * which is the single source of truth: it builds every solid the way the game makes
 * it (rooted at the tetrahedron) so the geometric colors are faithful, and it's the
 * same database identification uses. (Kept as its own function so the browse diagram
 * and its tests don't depend on the database's richer entry shape.)
 */
export interface LibraryShape {
  poly: Polyhedron;
  scheme: SchemeName;
}

/** The colored Polyhedron + color scheme for a diagram solid (case-insensitive),
 *  or null if the name is unknown. */
export function libraryShapeFor(name: string): LibraryShape | null {
  const e = namedPolyhedronFor(name);
  return e ? { poly: e.poly, scheme: e.scheme } : null;
}
