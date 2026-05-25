/// <reference lib="webworker" />
import { areIsomorphic, type GraphData } from "./isomorphism";

/**
 * Background isomorphism check. The main thread sends the current polyhedron's
 * labeled graph plus the candidate named polyhedron's graph; we reply with
 * whether they are isomorphic (which verifies the name with a ✓). Runs off the
 * main thread so a large brute-force never blocks dragging.
 */
interface Request {
  id: number;
  candidate: GraphData;
  target: GraphData;
}

self.onmessage = (e: MessageEvent<Request>) => {
  const { id, candidate, target } = e.data;
  const result = areIsomorphic(candidate, target);
  (self as DedicatedWorkerGlobalScope).postMessage({ id, result });
};
