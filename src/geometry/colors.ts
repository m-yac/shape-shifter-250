import { Color } from "three";
import { type Mesh } from "./HalfEdge";
import { config } from "../config";

/**
 * Per-element GEOMETRIC colors that travel with a committed polyhedron. Each value
 * is an unbounded non-negative integer assigned by the Conway operations (the
 * "c+1 / c+2 / c+3" rules). A geometric color is mapped to an actual palette entry
 * through the currently-selected color SCHEME (`config.render.colorSchemes`); a
 * geometric color past the scheme's length falls back to palette entry 0.
 *
 * Edges are keyed by their undirected vertex-index pair (`edgeKey`). Vertex and
 * face colors are indexed by mesh vertex / face index. Only face colors are drawn
 * today; vertex/edge colors are tracked so the Conway-operation rules can read
 * them and so they can be displayed later.
 */
export interface ColorSet {
  vertex: number[];
  face: number[];
  edge: Map<string, number>;
}

export type SchemeName = keyof typeof config.render.colorSchemes;

// The currently-selected color scheme. Switched by the OPTIONS "Colors" buttons
// (see ui/shapesPanel.ts → DragController.selectColorScheme); read by every
// geometric-color → RGB resolution below so a switch recolors the whole solid.
let currentScheme: SchemeName = config.render.defaultColorScheme as SchemeName;

/** The active color scheme name. */
export function getColorScheme(): SchemeName {
  return currentScheme;
}

/** Switch the active color scheme (does not itself re-render — caller recolors). */
export function setColorScheme(name: SchemeName): void {
  currentScheme = name;
}

/** Map a geometric color to a palette entry index via the active scheme
 *  (out-of-range geometric colors → palette entry 0, the fallback). */
function paletteIndex(geom: number): number {
  const scheme = config.render.colorSchemes[currentScheme] as readonly number[];
  return geom >= 0 && geom < scheme.length ? scheme[geom] : 0;
}

/** Undirected edge key from two vertex indices. */
export function edgeKey(a: number, b: number): string {
  return a < b ? `${a}_${b}` : `${b}_${a}`;
}

/** Resolve a geometric color to a FACE RGB Color (via the active scheme). */
export function paletteRGB(geom: number): Color {
  return new Color(config.render.palette[paletteIndex(geom)].face);
}

/** Resolve a geometric color to a darkened EDGE RGB Color (via the active scheme). */
export function darkRGB(geom: number): Color {
  return new Color(config.render.palette[paletteIndex(geom)].edge);
}

/** Map a whole face-color array to RGB (one Color per face). */
export function faceColorsRGB(face: number[]): Color[] {
  return face.map((i) => paletteRGB(i));
}

// --- "light" palette variants (only used by the _light.png export) ----------

/** Resolve a geometric color to a FACE RGB Color in the LIGHT palette. */
export function paletteRGBLight(geom: number): Color {
  return new Color(config.render.palette[paletteIndex(geom)].l_face);
}

/** Resolve a geometric color to an EDGE RGB Color in the LIGHT palette. */
export function darkRGBLight(geom: number): Color {
  return new Color(config.render.palette[paletteIndex(geom)].l_edge);
}

/** Map a whole face-color array to RGB using the LIGHT palette. */
export function faceColorsRGBLight(face: number[]): Color[] {
  return face.map((i) => paletteRGBLight(i));
}

/** Every undirected edge of a mesh, as keys, once each. */
export function meshEdgeKeys(mesh: Mesh): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const f of mesh.faces) {
    for (let i = 0; i < f.length; i++) {
      const k = edgeKey(f[i], f[(i + 1) % f.length]);
      if (!seen.has(k)) {
        seen.add(k);
        out.push(k);
      }
    }
  }
  return out;
}

/** A ColorSet with every element set to a single index (used for seeds). */
export function uniformColors(
  mesh: Mesh,
  vertexIdx: number,
  edgeIdx: number,
  faceIdx: number,
): ColorSet {
  const edge = new Map<string, number>();
  for (const k of meshEdgeKeys(mesh)) edge.set(k, edgeIdx);
  return {
    vertex: mesh.vertices.map(() => vertexIdx),
    face: mesh.faces.map(() => faceIdx),
    edge,
  };
}

/**
 * The color scheme that best fits a solid, recognised purely from topology, so the
 * UI can auto-switch when an operation forms one of the classic Platonic solids:
 *   - tetrahedron (4V/4F)                              → "tetrahedral"
 *   - octahedron (6V/8F tri) / cube (8V/6F quad)       → "octahedral"
 *   - icosahedron (12V/20F tri) / dodecahedron (20V/12F penta) → "icosahedral"
 * Returns null for anything else (the active scheme is then left unchanged).
 */
export function schemeForMesh(mesh: Mesh): SchemeName | null {
  const V = mesh.vertices.length;
  const F = mesh.faces.length;
  const sides = (n: number) => mesh.faces.every((f) => f.length === n);
  if (V === 4 && F === 4 && sides(3)) return "tetrahedral";
  if (V === 6 && F === 8 && sides(3)) return "octahedral";
  if (V === 8 && F === 6 && sides(4)) return "octahedral";
  if (V === 12 && F === 20 && sides(3)) return "icosahedral";
  if (V === 20 && F === 12 && sides(5)) return "icosahedral";
  return null;
}

/**
 * Initial colors for a freshly-loaded seed: the generic geometric coloring
 * (faces → 0, vertices → 1, edges → 2). The operations then layer on c+1/c+2/c+3
 * geometric colors, and the chosen color scheme decides how all of them display.
 * (There is no longer any per-solid special-casing; the scheme buttons replace it.)
 */
export function seedColors(mesh: Mesh): ColorSet {
  return uniformColors(mesh, 1, 2, 0); // vertices 1, edges 2, faces 0
}
