import { type Polyhedron } from "../geometry/polyhedron";
import { type MarkerKind } from "../render/sceneView";
import { type OperationKind } from "./types";
import { type HistoryEntry } from "../history/history";
import { config } from "../config";

/**
 * How an operation's selection relates to the solid it acted on:
 *   "whole"  — every vertex/face of its kind (or no explicit selection);
 *   "arity"  — all and only the elements of a single arity (degree-n vertices /
 *              n-gon faces), with `n` being that arity;
 *   "subset" — any other strict subset, with `n` the number of elements.
 */
export type SelectionCategory = "whole" | "arity" | "subset";

/** The operation that produced a history entry (null for the seed root). Carries
 *  everything needed to build the entry's label and derived name. */
export interface OpDescriptor {
  kind: OperationKind;
  /** True at the welded max end (rectify / join, or a full snub / gyro). */
  weld: boolean;
  category: SelectionCategory;
  /** The arity (for "arity") or the element count (for "subset"); 0 for "whole". */
  n: number;
}

/** Per-vertex degree (incident-face count = edge count on a closed solid). */
function vertexDegrees(poly: Polyhedron): number[] {
  const deg = new Array<number>(poly.vertices.length).fill(0);
  for (const f of poly.faces) for (const i of f) deg[i]++;
  return deg;
}

/**
 * Classify a selection against the solid it acts on. Mirrors the arity tally used
 * by the readout's `describeSet`: a selection is "arity" only when it is exactly
 * one arity class — every element of that arity and nothing of any other.
 */
export function classifySelection(
  poly: Polyhedron,
  sel: Set<number> | null,
  kind: MarkerKind,
): { category: SelectionCategory; n: number } {
  const onFaces = kind === "face";
  const elemCount = onFaces ? poly.faces.length : poly.vertices.length;
  if (sel === null || sel.size === 0 || sel.size === elemCount) {
    return { category: "whole", n: 0 };
  }

  const degrees = onFaces ? null : vertexDegrees(poly);
  const arityOf = (id: number): number =>
    onFaces ? poly.faces[id].length : degrees![id];

  // How many elements of each arity exist in the whole solid …
  const total = new Map<number, number>();
  for (let id = 0; id < elemCount; id++) {
    const a = arityOf(id);
    total.set(a, (total.get(a) ?? 0) + 1);
  }
  // … and which arities the selection touches.
  const selected = new Map<number, number>();
  for (const id of sel) {
    const a = arityOf(id);
    selected.set(a, (selected.get(a) ?? 0) + 1);
  }

  // Exactly one arity touched, and every element of it selected → an arity class.
  if (selected.size === 1) {
    const [a] = [...selected.keys()];
    if (selected.get(a) === total.get(a)) return { category: "arity", n: a };
  }
  return { category: "subset", n: sel.size };
}

/** "vertex"/"vertices" or "face"/"faces" agreeing with `n`. */
function noun(kind: MarkerKind, n: number): string {
  if (kind === "face") return n === 1 ? "face" : "faces";
  return n === 1 ? "vertex" : "vertices";
}

/** Fill `{n}` / `{noun}` and collapse the "{n}-" prefix when a single element is
 *  selected (so "1-Augmented" reads "Augmented"). */
function fill(template: string, n: number, kind: MarkerKind): string {
  const s = n === 1 ? template.replace("{n}-", "") : template;
  return s.replace(/{n}/g, String(n)).replace(/{noun}/g, noun(kind, n));
}

/** The marker kind an operation acts on (truncate/snub on vertices, kis/gyro on faces). */
function kindFor(op: OperationKind): MarkerKind {
  return op === "kis" || op === "gyro" ? "face" : "vertex";
}

/** The `[label, name]` template pair for an operation in a given weld / category. */
function templates(
  kind: OperationKind,
  weld: boolean,
  category: SelectionCategory,
): readonly [string, string] {
  return config.ui.operationLabels[kind][weld ? "welded" : "unwelded"][category];
}

/**
 * The action label for a committed operation, shown in the HISTORY rows
 * (e.g. "Rectify", "3-Truncate", "Kis 1 face"). `sel`/`selKind` describe what the
 * operation acted on, against `poly` (the shape it acted on, pre-operation).
 */
export function operationLabel(
  kind: OperationKind,
  weld: boolean,
  poly: Polyhedron,
  sel: Set<number> | null,
  selKind: MarkerKind,
): string {
  const { category, n } = classifySelection(poly, sel, selKind);
  return fill(templates(kind, weld, category)[0], n, selKind);
}

/** The modifier prepended to an ancestor's name to derive this entry's name. */
function operationModifier(op: OpDescriptor): string {
  return fill(templates(op.kind, op.weld, op.category)[1], op.n, kindFor(op.kind));
}

/** Collapse runs of an identical modifier into an "Nx" prefix (keeping order), so
 *  ["Rectified","Rectified","Truncated"] reads ["2x Rectified", "Truncated"]. */
function collapseRuns(mods: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < mods.length; ) {
    let j = i + 1;
    while (j < mods.length && mods[j] === mods[i]) j++;
    const count = j - i;
    out.push(count > 1 ? `${count}x ${mods[i]}` : mods[i]);
    i = j;
  }
  return out;
}

/**
 * The display name for history entry `index`: its identified name when known,
 * otherwise the operation modifiers from here back to the nearest known-named
 * ancestor, prepended to that ancestor's name (so modifiers stack across
 * unidentified steps, with consecutive repeats collapsed to "Nx"). Returns null
 * for an invalid (non-planarizable) entry.
 */
export function composeName(
  entries: readonly HistoryEntry[],
  index: number,
): string | null {
  const e = entries[index];
  if (!e) return null;
  if (e.name) return e.name; // a known, identified shape
  if (e.invalid || !e.op) return null;

  // Walk back collecting this entry's modifier and those of any unidentified
  // ancestors, until a known-named ancestor (or the seed) supplies the base.
  const mods: string[] = [];
  let base: string | null = null;
  for (let j = index; j >= 0; j--) {
    const a = entries[j];
    if (j < index) {
      if (a.invalid) continue; // ignore non-planarizable intermediate states
      if (a.name) { base = a.name; break; } // nearest known-named ancestor
      if (!a.op) break; // seed without a name (shouldn't happen) — give up
    }
    if (a.op) mods.push(operationModifier(a.op));
  }
  if (base == null) return null;
  return [...collapseRuns(mods), base].join(" ");
}
