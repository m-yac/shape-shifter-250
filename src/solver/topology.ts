import { type Polyhedron } from "../geometry/polyhedron";
import { outgoingHalfEdges, faceVertices, edgePairs } from "../geometry/HalfEdge";

/**
 * Fixed connectivity the solver needs (computed once per committed polyhedron):
 *  - consistently oriented faces (outward), so face normals are comparable,
 *  - cyclic neighbour list per vertex,
 *  - undirected edges (vertex pairs) for the dual / canonical strategy,
 *  - adjacent-face pairs per edge (for the coplanarity measure).
 */
export interface SolverTopology {
  orientedFaces: number[][];
  neighbors: number[][];
  edges: Array<[number, number]>;
  edgeFaces: Array<[number, number]>;
}

export function extractTopology(poly: Polyhedron): SolverTopology {
  const dcel = poly.dcel;
  const orientedFaces = dcel.faces.map((f) => faceVertices(f).map((v) => v.id));
  const neighbors = dcel.vertices.map((v) =>
    outgoingHalfEdges(v).map((h) => h.next.origin.id),
  );
  const edges = edgePairs(dcel);
  const edgeFaces: Array<[number, number]> = [];
  for (const he of dcel.halfedges) {
    if (he.twin && he.id < he.twin.id) edgeFaces.push([he.face.id, he.twin.face.id]);
  }
  return { orientedFaces, neighbors, edges, edgeFaces };
}
