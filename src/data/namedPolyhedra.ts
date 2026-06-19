import { type Mesh } from "../geometry/HalfEdge";
import { Polyhedron } from "../geometry/polyhedron";
import { seedColors, type ColorSet, type SchemeName } from "../geometry/colors";
import { getSeed } from "../geometry/seeds";
import { buildTruncate } from "../operations/truncate";
import { buildSnub } from "../operations/snub";
import { buildKis } from "../operations/kis";
import { buildGyro } from "../operations/gyro";

/**
 * The named-polyhedron database — the SINGLE source of truth for both
 * identification (`identify/identify.ts`) and the LIBRARY browse diagram
 * (`ui/libraryBrowser.ts` via `libraryShapeFor`).
 *
 * Identification is purely combinatorial (vertex/face configurations + V,E,F), so
 * an entry only needs correct CONNECTIVITY. The LIBRARY, however, also renders each
 * solid in its *default colors*, and those depend on the construction PATH — so we
 * build every solid the way the GAME makes it: rooted at the tetrahedron (the only
 * starting seed), following the same operation tree the player would (e.g. the
 * game's cube is `join(tetrahedron)`, whose faces inherit the tetrahedron's edge
 * color — not a bare cube seed whose faces are color 0). Each entry also carries the
 * symmetry color SCHEME it displays in, mirroring the live app's auto-switch.
 *
 * ── To add your own ──────────────────────────────────────────────────────────
 *   Build it from an existing solid with the recipe helpers below (truncate /
 *   rectify / kis / join / snub / gyro, or the arity-selected truncateVerticesOfDegree
 *   / kisFacesOfSides), then add an `E(name, type, scheme, poly)` entry.
 * ─────────────────────────────────────────────────────────────────────────────
 */
/** The family a named solid belongs to (shown in the discovery popup). */
export type SolidType =
  | "Platonic solid"
  | "Archimedean solid"
  | "Catalan solid"
  | "Chamfered solid"
  | "Subdivided solid"
  | "Johnson solid"
  | "Dihedral solid";

export interface NamedPolyhedron {
  name: string;
  type: SolidType;
  /** A colored embedding built by the recipe. `poly.mesh` is its connectivity
   *  (all identification needs); `poly.colors` carries the geometric colors so
   *  the LIBRARY browse diagram can render each solid in its default colors. */
  poly: Polyhedron;
  /** The symmetry-appropriate color scheme (the one the live app auto-switches to
   *  for this solid's family), so the browse diagram colors each solid the way the
   *  live app does when you make it. */
  scheme: SchemeName;
}

// --- recipe helpers ---------------------------------------------------------
// Colors propagate through a chain of operations exactly as they do during live
// editing (a fresh seed starts with `seedColors`, and every operation layers on its
// c+n rule). Each helper takes and returns a *colored* Polyhedron.
const wrap = (r: { mesh: Mesh; colors: ColorSet }): Polyhedron =>
  new Polyhedron(r.mesh, r.colors);

/** Uniform truncation (intermediate topology). */
const truncate = (p: Polyhedron): Polyhedron =>
  wrap(buildTruncate(p, 0, null).commit(0.5, false));
/** Rectify / ambo (the welded "max" of the truncate drag). */
const rectify = (p: Polyhedron): Polyhedron =>
  wrap(buildTruncate(p, 0, null).commit(1, true));
/** Kis (intermediate topology). */
const kis = (p: Polyhedron): Polyhedron =>
  wrap(buildKis(p, 0, null).commit(0.5, false));
/** Join (the welded "max" of the kis drag). */
const join = (p: Polyhedron): Polyhedron =>
  wrap(buildKis(p, 0, null).commit(1, true));
/** Snub (the welded "max" of the snub drag). */
const snub = (p: Polyhedron): Polyhedron =>
  wrap(buildSnub(p, 0, null).commit(1, true));
/** Gyro (the welded "max" of the gyro drag). */
const gyro = (p: Polyhedron): Polyhedron =>
  wrap(buildGyro(p, 0, null).commit(1, true));

// --- arity-selected operations (for the chamfer / subdivide recipes) --------
/** Per-vertex degree (incident-face count) of a solid. */
const vertexDegrees = (poly: Polyhedron): number[] => {
  const deg = new Array<number>(poly.vertices.length).fill(0);
  for (const f of poly.faces) for (const i of f) deg[i]++;
  return deg;
};

/** Truncate (intermediate topology) only the degree-`n` vertices of `p`. */
const truncateVerticesOfDegree = (p: Polyhedron, n: number): Polyhedron => {
  const deg = vertexDegrees(p);
  const sel = new Set<number>();
  for (let i = 0; i < deg.length; i++) if (deg[i] === n) sel.add(i);
  return wrap(buildTruncate(p, sel.values().next().value as number, sel).commit(0.5, false));
};

/** Kis (intermediate topology) only the `n`-gon faces of `p`. */
const kisFacesOfSides = (p: Polyhedron, n: number): Polyhedron => {
  const sel = new Set<number>();
  p.faces.forEach((f, i) => {
    if (f.length === n) sel.add(i);
  });
  return wrap(buildKis(p, sel.values().next().value as number, sel).commit(0.5, false));
};

/** Finalize a colored solid into a named-database entry. */
const E = (
  name: string,
  type: SolidType,
  scheme: SchemeName,
  poly: Polyhedron,
): NamedPolyhedron => ({ name, type, poly, scheme });

const P: SolidType = "Platonic solid";
const A: SolidType = "Archimedean solid";
const C: SolidType = "Catalan solid";
const Ch: SolidType = "Chamfered solid";
const Sub: SolidType = "Subdivided solid";

const TE: SchemeName = "tetrahedral";
const OC: SchemeName = "octahedral";
const IC: SchemeName = "icosahedral";

// --- the construction tree, rooted at the tetrahedron -----------------------
// (Identical to what the game produces from the only starting seed.)
const tetMesh = getSeed("tetrahedron");
const tet = new Polyhedron(tetMesh, seedColors(tetMesh));

const oct = rectify(tet); //  rectify(tetra) = octahedron
const cube = join(tet); //    join(tetra)    = cube
const ico = snub(oct); //     snub(octa)     = icosahedron
const dod = gyro(cube); //    gyro(cube)     = dodecahedron

const cuboct = rectify(oct); //  rectify(octa)  = cuboctahedron
const rhDod = join(oct); //      join(octa)     = rhombic dodecahedron
const icosidod = rectify(ico); // rectify(icosa) = icosidodecahedron
const rhTri = join(ico); //      join(icosa)    = rhombic triacontahedron

export const NAMED: NamedPolyhedron[] = [
  // Platonic solids
  E("Tetrahedron", P, TE, tet),
  E("Octahedron", P, OC, oct),
  E("Cube", P, OC, cube),
  E("Icosahedron", P, IC, ico),
  E("Dodecahedron", P, IC, dod),

  // Archimedean solids — truncations
  E("Truncated tetrahedron", A, TE, truncate(tet)),
  E("Truncated octahedron", A, OC, truncate(oct)),
  E("Truncated cube", A, OC, truncate(cube)),
  E("Truncated icosahedron", A, IC, truncate(ico)),
  E("Truncated dodecahedron", A, IC, truncate(dod)),
  // Archimedean solids — rectifications & beyond
  E("Cuboctahedron", A, OC, cuboct),
  E("Icosidodecahedron", A, IC, icosidod),
  E("Truncated Cuboctahedron", A, OC, truncate(cuboct)),
  E("Truncated Icosidodecahedron", A, IC, truncate(icosidod)),
  E("Rhombicuboctahedron", A, OC, rectify(cuboct)),
  E("Rhombicosidodecahedron", A, IC, rectify(icosidod)),
  E("Snub cuboctahedron", A, OC, snub(cuboct)),
  E("Snub Icosidodecahedron", A, IC, snub(icosidod)),

  // Catalan solids — kis
  E("Triakis tetrahedron", C, TE, kis(tet)),
  E("Triakis octahedron", C, OC, kis(oct)),
  E("Tetrakis hexahedron", C, OC, kis(cube)),
  E("Triakis icosahedron", C, IC, kis(ico)),
  E("Pentakis dodecahedron", C, IC, kis(dod)),
  // Catalan solids — joins & beyond
  E("Rhombic dodecahedron", C, OC, rhDod),
  E("Rhombic triacontahedron", C, IC, rhTri),
  E("Disdyakis dodecahedron", C, OC, kis(rhDod)),
  E("Disdyakis triacontahedron", C, IC, kis(rhTri)),
  E("Deltoidal icositetrahedron", C, OC, join(cuboct)),
  E("Deltoidal hexecontahedron", C, IC, join(icosidod)),
  E("Pentagonal icositetrahedron", C, OC, gyro(rhDod)),
  E("Pentagonal hexecontahedron", C, IC, gyro(rhTri)),

  // Chamfered solids (join, then truncate the join's vertices of the original
  // face's arity). The tetrahedron's join (the cube) is vertex-uniform, so its
  // chamfer coincides with the truncated cube and isn't a separate shape.
  E("Chamfered cube", Ch, OC, truncateVerticesOfDegree(join(cube), 4)),
  E("Chamfered octahedron", Ch, OC, truncateVerticesOfDegree(rhDod, 3)),
  E("Chamfered dodecahedron", Ch, IC, truncateVerticesOfDegree(join(dod), 5)),
  E("Chamfered icosahedron", Ch, IC, truncateVerticesOfDegree(rhTri, 3)),

  // Subdivided solids (rectify, then kis the faces that came from the original
  // vertices). The tetrahedron's rectify (the octahedron) is face-uniform, so its
  // subdivision coincides with the triakis octahedron and isn't a separate shape.
  E("Subdivided cube", Sub, OC, kisFacesOfSides(rectify(cube), 3)),
  E("Subdivided octahedron", Sub, OC, kisFacesOfSides(cuboct, 4)),
  E("Subdivided dodecahedron", Sub, IC, kisFacesOfSides(rectify(dod), 3)),
  E("Subdivided icosahedron", Sub, IC, kisFacesOfSides(icosidod, 5)),
];

/** The family ("Platonic solid", …) of a named solid, or null if unknown. */
export function solidTypeFor(name: string): SolidType | null {
  return NAMED.find((n) => n.name === name)?.type ?? null;
}

// Case-insensitive lookup from a display name to its database entry. The
// LIBRARY diagram (config) lists names in Title Case ("Truncated Tetrahedron")
// while the database mixes case ("Truncated tetrahedron"), so normalize both.
const BY_NAME = new Map<string, NamedPolyhedron>();
for (const e of NAMED) BY_NAME.set(e.name.toLowerCase(), e);

/** The database entry (colored Polyhedron + scheme) for a named solid
 *  (case-insensitive), or null. */
export function namedPolyhedronFor(name: string): NamedPolyhedron | null {
  return BY_NAME.get(name.trim().toLowerCase()) ?? null;
}
