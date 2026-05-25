import { describe, it, expect } from "vitest";
import { getSeed, seedNames, dual } from "../src/geometry/seeds";
import { buildDCEL, counts } from "../src/geometry/HalfEdge";
import {
  computeSignature,
  canonicalSequence,
  formatConfig,
} from "../src/identify/configurations";

const EULER = {
  tetrahedron: { V: 4, E: 6, F: 4 },
  cube: { V: 8, E: 12, F: 6 },
  octahedron: { V: 6, E: 12, F: 8 },
  dodecahedron: { V: 20, E: 30, F: 12 },
  icosahedron: { V: 12, E: 30, F: 20 },
};

describe("canonicalSequence", () => {
  it("is invariant under rotation and reflection", () => {
    expect(canonicalSequence([4, 3, 4, 3])).toBe("3.4.3.4");
    expect(canonicalSequence([3, 4, 3, 4])).toBe("3.4.3.4");
    expect(canonicalSequence([3, 8, 8])).toBe("3.8.8");
    expect(canonicalSequence([8, 3, 8])).toBe("3.8.8");
    expect(canonicalSequence([3, 3, 3, 3, 5])).toBe("3.3.3.3.5");
    expect(canonicalSequence([5, 3, 3, 3, 3])).toBe("3.3.3.3.5");
  });
});

describe("formatConfig", () => {
  it("compresses runs into exponents", () => {
    expect(formatConfig("4.4.4.4.4")).toBe("4^5");
    expect(formatConfig("3.3.3.3.5")).toBe("3^4.5");
    expect(formatConfig("4.4.4")).toBe("4^3");
    expect(formatConfig("3.4.3.4")).toBe("3.4.3.4"); // no consecutive runs
    expect(formatConfig("3.8.8")).toBe("3.8^2");
  });
});

describe("Platonic seeds", () => {
  it("exposes all five", () => {
    expect(seedNames().sort()).toEqual(Object.keys(EULER).sort());
  });

  for (const [name, e] of Object.entries(EULER)) {
    it(`${name} has correct V/E/F and satisfies Euler`, () => {
      const dcel = buildDCEL(getSeed(name));
      const c = counts(dcel);
      expect(c).toEqual(e);
      expect(c.V - c.E + c.F).toBe(2);
    });
  }
});

describe("configurations", () => {
  it("cube: 8 vertices (4.4.4), 6 faces (3.3.3.3)", () => {
    const sig = computeSignature(buildDCEL(getSeed("cube")));
    expect(sig.vertexConfigs).toEqual({ "4.4.4": 8 });
    expect(sig.faceConfigs).toEqual({ "3.3.3.3": 6 });
  });

  it("icosahedron: 12 vertices (3.3.3.3.3), 20 faces (5.5.5)", () => {
    const sig = computeSignature(buildDCEL(getSeed("icosahedron")));
    expect(sig.vertexConfigs).toEqual({ "3.3.3.3.3": 12 });
    expect(sig.faceConfigs).toEqual({ "5.5.5": 20 });
  });
});

describe("dual", () => {
  it("dual of the cube is the octahedron (combinatorially)", () => {
    const d = buildDCEL(dual(getSeed("cube")));
    expect(counts(d)).toEqual({ V: 6, E: 12, F: 8 });
  });
});
