import { type Mesh } from "../geometry/HalfEdge";
import { Polyhedron } from "../geometry/polyhedron";
import { getSeed } from "../geometry/seeds";
import { buildTruncate } from "../operations/truncate";
import { buildKis } from "../operations/kis";

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
const truncate = (name: string): Mesh =>
  buildTruncate(new Polyhedron(getSeed(name)), 0, null).commit(0.5, false);

/** Rectify / ambo of a seed (the welded "max" of the truncate drag). */
const rectify = (name: string): Mesh =>
  buildTruncate(new Polyhedron(getSeed(name)), 0, null).commit(1, true);

/** Kis (intermediate topology) of a seed. */
const kis = (name: string): Mesh =>
  buildKis(new Polyhedron(getSeed(name)), 0, null).commit(0.5, false);

/** Join of a seed (the welded "max" of the kis drag). */
const join = (name: string): Mesh =>
  buildKis(new Polyhedron(getSeed(name)), 0, null).commit(1, true);

export const NAMED: NamedPolyhedron[] = [
  // Platonic solids
  { name: "Tetrahedron", mesh: seed("tetrahedron") },
  { name: "Cube", mesh: seed("cube") },
  { name: "Octahedron", mesh: seed("octahedron") },
  { name: "Dodecahedron", mesh: seed("dodecahedron") },
  { name: "Icosahedron", mesh: seed("icosahedron") },

  // Rectified (Archimedean / quasiregular)
  { name: "Cuboctahedron", mesh: rectify("cube") },
  { name: "Icosidodecahedron", mesh: rectify("icosahedron") },

  // Truncated (Archimedean)
  { name: "Truncated tetrahedron", mesh: truncate("tetrahedron") },
  { name: "Truncated cube", mesh: truncate("cube") },
  { name: "Truncated octahedron", mesh: truncate("octahedron") },
  { name: "Truncated dodecahedron", mesh: truncate("dodecahedron") },
  { name: "Truncated icosahedron", mesh: truncate("icosahedron") },

  // Join (Catalan / rhombic)
  { name: "Rhombic dodecahedron", mesh: join("cube") },
  { name: "Rhombic triacontahedron", mesh: join("dodecahedron") },

  // Kis (Catalan / pyramid-augmented)
  { name: "Triakis tetrahedron", mesh: kis("tetrahedron") },
  { name: "Tetrakis hexahedron", mesh: kis("cube") },
  { name: "Triakis octahedron", mesh: kis("octahedron") },
  { name: "Pentakis dodecahedron", mesh: kis("dodecahedron") },
  { name: "Triakis icosahedron", mesh: kis("icosahedron") },
];
