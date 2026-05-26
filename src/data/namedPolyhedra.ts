import { type Mesh } from "../geometry/HalfEdge";
import { Polyhedron } from "../geometry/polyhedron";
import { getSeed } from "../geometry/seeds";
import { buildTruncate } from "../operations/truncate";
import { buildSnub } from "../operations/snub";
import { buildKis } from "../operations/kis";
import { buildGyro } from "../operations/gyro";

/**
 * The named-polyhedron database used for identification.
 *
 * Identification is purely combinatorial (vertex/face configurations + V,E,F),
 * so an entry only needs correct CONNECTIVITY — the positions can be any valid
 * embedding. To keep this list error-free we generate most entries by applying
 * our own operations to the Platonic seeds (e.g. "cuboctahedron = rectify(cube)").
 *
 * ── To add your own ──────────────────────────────────────────────────────────
 *   • From a recipe:  { name: "...", mesh: rectify("octahedron") }
 *   • From raw data:  { name: "...", mesh: { vertices:[...], faces:[[...]] } }
 *     (winding is fixed automatically; positions only need to form a valid solid)
 * ─────────────────────────────────────────────────────────────────────────────
 */
export interface NamedPolyhedron {
  name: string;
  mesh: Mesh;
}

// --- recipe helpers ---------------------------------------------------------
const seed = (name: string): Mesh => getSeed(name);

/** Uniform truncation (intermediate topology) of a seed. */
const truncate = (mesh: Mesh): Mesh =>
  buildTruncate(new Polyhedron(mesh), 0, null).commit(0.5, false);

/** Rectify / ambo of a seed (the welded "max" of the truncate drag). */
const rectify = (mesh: Mesh): Mesh =>
  buildTruncate(new Polyhedron(mesh), 0, null).commit(1, true);

/** Snub of a seed */
const snub = (mesh: Mesh): Mesh =>
  buildSnub(new Polyhedron(mesh), 0, null).commit(1, true);

/** Kis (intermediate topology) of a seed. */
const kis = (mesh: Mesh): Mesh =>
  buildKis(new Polyhedron(mesh), 0, null).commit(0.5, false);

/** Join of a seed (the welded "max" of the kis drag). */
const join = (mesh: Mesh): Mesh =>
  buildKis(new Polyhedron(mesh), 0, null).commit(1, true);

/** Join of a seed (the welded "max" of the kis drag). */
const gyro = (mesh: Mesh): Mesh =>
  buildGyro(new Polyhedron(mesh), 0, null).commit(1, true);

export const NAMED: NamedPolyhedron[] = [
  // Platonic solids
  { name: "Tetrahedron", mesh: seed("tetrahedron") },
  { name: "Cube", mesh: seed("cube") },
  { name: "Octahedron", mesh: seed("octahedron") },
  { name: "Dodecahedron", mesh: seed("dodecahedron") },
  { name: "Icosahedron", mesh: seed("icosahedron") },

  // Archimedean solids

  // 1. Truncated
  { name: "Truncated tetrahedron", mesh: truncate(getSeed("tetrahedron")) },
  { name: "Truncated cube", mesh: truncate(getSeed("cube")) },
  { name: "Truncated octahedron", mesh: truncate(getSeed("octahedron")) },
  { name: "Truncated dodecahedron", mesh: truncate(getSeed("dodecahedron")) },
  { name: "Truncated icosahedron", mesh: truncate(getSeed("icosahedron")) },

  // 2. Rectified
  { name: "Cuboctahedron", mesh: rectify(getSeed("cube")) },
  { name: "Icosidodecahedron", mesh: rectify(getSeed("icosahedron")) },

  // 3. Truncated-Rectified
  { name: "Truncated Cuboctahedron", mesh: truncate(rectify(getSeed("cube"))) },
  { name: "Truncated Icosidodecahedron", mesh: truncate(rectify(getSeed("icosahedron"))) },

  // 4. Double-Rectified
  { name: "Rhombicuboctahedron", mesh: rectify(rectify(getSeed("cube"))) },
  { name: "Rhombiccosidodecahedron", mesh: rectify(rectify(getSeed("icosahedron"))) },

  // 5. Snub-Rectified
  { name: "Snub cuboctahedron", mesh: snub(rectify(getSeed("cube"))) },
  { name: "Snub Icosidodecahedron", mesh: snub(rectify(getSeed("icosahedron"))) },

  // Catalan solids

  // 1. Kissed
  { name: "Triakis tetrahedron", mesh: kis(getSeed("tetrahedron")) },
  { name: "Tetrakis hexahedron", mesh: kis(getSeed("cube")) },
  { name: "Triakis octahedron", mesh: kis(getSeed("octahedron")) },
  { name: "Pentakis dodecahedron", mesh: kis(getSeed("dodecahedron")) },
  { name: "Triakis icosahedron", mesh: kis(getSeed("icosahedron")) },

  // 2. Joined
  { name: "Rhombic dodecahedron", mesh: join(getSeed("cube")) },
  { name: "Rhombic triacontahedron", mesh: join(getSeed("dodecahedron")) },

  // 3. Kissed-Joined
  { name: "Disdyakis dodecahedron", mesh: kis(join(getSeed("cube"))) },
  { name: "Disdyakis triacontahedron", mesh: kis(join(getSeed("dodecahedron"))) },

  // 4. Double-Joined
  { name: "Deltoidal icositetrahedron", mesh: join(join(getSeed("cube"))) },
  { name: "Deltoidal hexecontahedron", mesh: join(join(getSeed("dodecahedron"))) },

  // 5. Gyro-Joined
  { name: "Pentagonal icositetrahedron", mesh: gyro(join(getSeed("cube"))) },
  { name: "Pentagonal hexecontahedron", mesh: gyro(join(getSeed("dodecahedron"))) },
];
