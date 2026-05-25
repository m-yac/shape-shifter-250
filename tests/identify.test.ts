import { describe, it, expect } from "vitest";
import { getSeed } from "../src/geometry/seeds";
import { Polyhedron } from "../src/geometry/polyhedron";
import { buildTruncate } from "../src/operations/truncate";
import { buildKis } from "../src/operations/kis";
import { identify, buildGraphData, namedGraphFor } from "../src/identify/identify";
import { areIsomorphic } from "../src/identify/isomorphism";

const poly = (name: string) => new Polyhedron(getSeed(name));

describe("identify", () => {
  it("names the Platonic seeds", () => {
    expect(identify(poly("cube")).name).toBe("Cube");
    expect(identify(poly("icosahedron")).name).toBe("Icosahedron");
  });

  it("names operation results", () => {
    const cuboct = new Polyhedron(buildTruncate(poly("cube"), 0, null).commit(1, true));
    expect(identify(cuboct).name).toBe("Cuboctahedron");

    const rhombicDodec = new Polyhedron(buildKis(poly("cube"), 0, null).commit(1, true));
    expect(identify(rhombicDodec).name).toBe("Rhombic dodecahedron");

    // rectified tetrahedron is combinatorially the octahedron
    const rectTetra = new Polyhedron(buildTruncate(poly("tetrahedron"), 0, null).commit(1, true));
    expect(identify(rectTetra).name).toBe("Octahedron");
  });
});

describe("isomorphism verification", () => {
  it("verifies a matched name", () => {
    const cuboct = new Polyhedron(buildTruncate(poly("cube"), 0, null).commit(1, true));
    const target = namedGraphFor("Cuboctahedron")!;
    expect(areIsomorphic(buildGraphData(cuboct), target)).toBe(true);
  });

  it("rejects a non-isomorphic graph", () => {
    const target = namedGraphFor("Octahedron")!;
    expect(areIsomorphic(buildGraphData(poly("cube")), target)).toBe(false);
  });

  it("a seed verifies against itself", () => {
    expect(areIsomorphic(buildGraphData(poly("dodecahedron")), namedGraphFor("Dodecahedron")!)).toBe(true);
  });
});
