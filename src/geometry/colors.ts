import { Color } from "three";
import { type Mesh } from "./HalfEdge";
import { config } from "../config";

/**
 * Per-element palette colors that travel with a committed polyhedron. Each value
 * is an INDEX into `config.render.palette` (resolved to RGB by `paletteRGB`);
 * indices may exceed the palette length (the "max+1" rule is unbounded), in which
 * case they fall back to `config.render.fallbackColor`.
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

/** Undirected edge key from two vertex indices. */
export function edgeKey(a: number, b: number): string {
  return a < b ? `${a}_${b}` : `${b}_${a}`;
}

/** Resolve a palette index to a FACE RGB Color (out-of-range → fallback). */
export function paletteRGB(index: number): Color {
  const pal = config.render.palette;
  const hex = index >= 0 && index < pal.length ? pal[index] : config.render.fallbackColor;
  return new Color(hex);
}

/** Resolve a palette index to a darkened EDGE RGB Color (out-of-range → fallback). */
export function darkRGB(index: number): Color {
  const pal = config.render.darkPalette;
  const hex = index >= 0 && index < pal.length ? pal[index] : config.render.darkFallbackColor;
  return new Color(hex);
}

/** Map a whole face-color array to RGB (one Color per face). */
export function faceColorsRGB(face: number[]): Color[] {
  return face.map((i) => paletteRGB(i));
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
 * Recognise a "special" dual-pair solid purely from topology (no geometry /
 * relaxation needed), so the special coloring can be applied at commit time. The
 * tetrahedron is deliberately NOT special — it (and its truncations / kisses) is
 * the only family that ever uses color 0.
 *
 *   - "triFace"  = the triangular member (octahedron 6V/8F, icosahedron 12V/20F)
 *   - "polyFace" = its dual (cube 8V/6F squares, dodecahedron 20V/12F pentagons)
 */
export function detectSpecial(mesh: Mesh): "triFace" | "polyFace" | null {
  const V = mesh.vertices.length;
  const F = mesh.faces.length;
  const allTri = mesh.faces.every((f) => f.length === 3);
  if (allTri && ((V === 6 && F === 8) || (V === 12 && F === 20))) return "triFace";
  if (V === 8 && F === 6 && mesh.faces.every((f) => f.length === 4)) return "polyFace";
  if (V === 20 && F === 12 && mesh.faces.every((f) => f.length === 5)) return "polyFace";
  return null;
}

/**
 * The special coloring for a dual-pair solid (only meaningful when `detectSpecial`
 * matched). Edges → 3 for both; the triangular member's faces (and the dual's
 * vertices) → 1, and the dual's faces (with the triangular member's vertices) → 2.
 *   - triFace (octahedron / icosahedron): faces → 1, vertices → 2, edges → 3
 *   - polyFace (cube / dodecahedron):     vertices → 1, faces → 2, edges → 3
 */
export function specialColorSet(mesh: Mesh, kind: "triFace" | "polyFace"): ColorSet {
  return kind === "triFace"
    ? uniformColors(mesh, 2, 3, 1) // vertices 2, edges 3, faces 1
    : uniformColors(mesh, 1, 3, 2); // vertices 1, edges 3, faces 2
}

/**
 * Initial colors for a freshly-loaded seed. The tetrahedron keeps the generic
 * coloring (faces → 0, vertices → 1, edges → 2); every other Platonic seed is a
 * special dual-pair solid and gets its special coloring directly.
 */
export function seedColors(mesh: Mesh): ColorSet {
  const special = detectSpecial(mesh);
  if (special) return specialColorSet(mesh, special);
  return uniformColors(mesh, 1, 2, 0); // vertices 1, edges 2, faces 0
}
