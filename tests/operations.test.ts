import { describe, it, expect } from "vitest";
import { getSeed } from "../src/geometry/seeds";
import { Polyhedron } from "../src/geometry/polyhedron";
import { buildDCEL, counts } from "../src/geometry/HalfEdge";
import { buildTruncate } from "../src/operations/truncate";
import { buildKis } from "../src/operations/kis";
import { buildSnub } from "../src/operations/snub";
import { buildGyro } from "../src/operations/gyro";
import { computeSignature } from "../src/identify/configurations";
import { weldVertexPairs } from "../src/operations/weld";
import { Vector3 } from "three";

const cube = () => new Polyhedron(getSeed("cube"));
const octahedron = () => new Polyhedron(getSeed("octahedron"));

/** Multiset of face orders (sides per face) in a mesh. */
const faceOrderCounts = (faces: number[][]): Record<number, number> => {
  const m: Record<number, number> = {};
  for (const f of faces) m[f.length] = (m[f.length] ?? 0) + 1;
  return m;
};

describe("truncate / rectify", () => {
  it("intermediate truncation of the cube is the truncated cube (3.8.8)", () => {
    const mesh = buildTruncate(cube(), 0, null).commit(0.5, false);
    const sig = computeSignature(buildDCEL(mesh));
    expect(sig).toMatchObject({ V: 24, E: 36, F: 14 });
    expect(sig.vertexConfigs).toEqual({ "3.8.8": 24 });
    expect(sig.faceConfigs).toEqual({ "3.3.3": 8, "3.3.3.3.3.3.3.3": 6 });
  });

  it("welded max (rectify) of the cube is the cuboctahedron (3.4.3.4)", () => {
    const mesh = buildTruncate(cube(), 0, null).commit(1, true);
    const sig = computeSignature(buildDCEL(mesh));
    expect(sig).toMatchObject({ V: 12, E: 24, F: 14 });
    expect(sig.vertexConfigs).toEqual({ "3.4.3.4": 12 });
    expect(sig.faceConfigs).toEqual({ "4.4.4": 8, "4.4.4.4": 6 });
  });
});

describe("kis / join", () => {
  it("intermediate kis of the cube is the tetrakis hexahedron", () => {
    const mesh = buildKis(cube(), 0, null).commit(0.5, false);
    const c = counts(buildDCEL(mesh));
    // 8 original + 6 apex vertices; every face a triangle (6 faces × 4 tris)
    expect(c).toEqual({ V: 14, E: 36, F: 24 });
  });

  it("welded max (join) of the cube is the rhombic dodecahedron (3.4.3.4 faces)", () => {
    const mesh = buildKis(cube(), 0, null).commit(1, true);
    const sig = computeSignature(buildDCEL(mesh));
    expect(sig).toMatchObject({ V: 14, E: 24, F: 12 });
    expect(sig.vertexConfigs).toEqual({ "4.4.4": 8, "4.4.4.4": 6 });
    expect(sig.faceConfigs).toEqual({ "3.4.3.4": 12 });
  });
});

describe("snub", () => {
  it("intermediate snub of the octahedron (all degree-4 vertices, n=2)", () => {
    const mesh = buildSnub(octahedron(), 0, null).commit(0.5, false);
    const c = counts(buildDCEL(mesh));
    // 24 cut verts (one per half-edge); 8 hexagons (truncated tris) + 12 ear tris.
    expect(c).toEqual({ V: 24, E: 42, F: 20 });
    expect(faceOrderCounts(mesh.faces)).toEqual({ 3: 12, 6: 8 });
  });

  it("welded max (snub) of the octahedron is the icosahedron (3^5)", () => {
    const mesh = buildSnub(octahedron(), 0, null).commit(1, true);
    const sig = computeSignature(buildDCEL(mesh));
    expect(sig).toMatchObject({ V: 12, E: 30, F: 20 });
    expect(sig.vertexConfigs).toEqual({ "3.3.3.3.3": 12 });
    expect(sig.faceConfigs).toEqual({ "5.5.5": 20 });
  });

  it("throws (no-op) on a solid with odd-degree vertices", () => {
    // cube vertices are degree 3 → snub cannot alternate the cut vertices.
    expect(() => buildSnub(cube(), 0, null)).toThrow();
  });
});

describe("gyro", () => {
  it("intermediate gyro of the cube (all 4-gon faces, n=2)", () => {
    const mesh = buildGyro(cube(), 0, null).commit(0.5, false);
    const c = counts(buildDCEL(mesh));
    // 8 originals + 2 peripherals per face (no apex at n=2); 2 quads + 2 tris / face.
    expect(c).toEqual({ V: 20, E: 42, F: 24 });
    expect(faceOrderCounts(mesh.faces)).toEqual({ 3: 12, 4: 12 });
  });

  it("closes on hexagonal (n=3) faces: gyro of the truncated octahedron", () => {
    // Truncated octahedron: 8 hexagons + 6 squares, all even-sided. Exercises the
    // n>=3 pentagon+triangle tiling (the n=2 cube test only hits the collapsed path).
    const truncOcta = buildTruncate(octahedron(), 0, null).commit(0.5, false);
    const mesh = buildGyro(new Polyhedron(truncOcta), 0, null).commit(0.5, false);
    const c = counts(buildDCEL(mesh)); // valid Euler counts ⇒ a closed manifold
    expect(c).toEqual({ V: 68, E: 138, F: 72 });
    // 24 pentagons (3 per hexagon) + 12 quads (2 per square) + 36 triangles.
    expect(faceOrderCounts(mesh.faces)).toEqual({ 3: 36, 4: 12, 5: 24 });
  });

  it("welded max (gyro) of the cube is the dodecahedron (5^3)", () => {
    const mesh = buildGyro(cube(), 0, null).commit(1, true);
    const sig = computeSignature(buildDCEL(mesh));
    expect(sig).toMatchObject({ V: 20, E: 30, F: 12 });
    expect(sig.vertexConfigs).toEqual({ "5.5.5": 20 });
    expect(sig.faceConfigs).toEqual({ "3.3.3.3.3": 12 });
  });

  it("throws (no-op) on a solid with odd-sided faces", () => {
    // octahedron faces are triangles → gyro cannot alternate the boundary.
    expect(() => buildGyro(octahedron(), 0, null)).toThrow();
  });
});

describe("weldVertexPairs", () => {
  it("merges a pair and drops the collapsed edge", () => {
    // two triangles sharing an edge (a square split by a diagonal)
    const mesh = {
      vertices: [
        new Vector3(0, 0, 0),
        new Vector3(1, 0, 0),
        new Vector3(1, 1, 0),
        new Vector3(0, 1, 0),
      ],
      faces: [
        [0, 1, 2],
        [0, 2, 3],
      ],
    };
    const welded = weldVertexPairs(mesh, [[1, 3]]);
    expect(welded.vertices.length).toBe(3);
    // each triangle loses the welded duplicate and stays a triangle
    expect(welded.faces.every((f) => f.length === 3)).toBe(true);
  });
});
