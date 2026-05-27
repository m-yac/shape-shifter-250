import { type Signature, describeSignature } from "../identify/configurations";
import { type MarkerKind } from "../render/sceneView";
import { type OperationKind } from "../operations/types";
import { config } from "../config";
import { Polyhedron } from "../geometry/polyhedron";
import { canSnub } from "../operations/snub";
import { canGyro } from "../operations/gyro";

/** "vertex"/"vertices" or "face"/"faces" agreeing with `n`. */
function plural(element: "vertex" | "face", n: number): string {
  if (n === 1) return element;
  return element === "vertex" ? "vertices" : "faces";
}

/** Whether two id sets hold exactly the same members. */
function sameSet(a: Set<number>, b: Set<number>): boolean {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

/**
 * The present-participle verb shown while a drag is in progress, keyed by the
 * operation and whether the drag has reached its welded max end. Snub/gyro read
 * the same regardless of weld.
 */
const DRAG_VERB: Record<OperationKind, [unwelded: string, welded: string]> = {
  truncate: ["Truncating", "Rectifying"],
  kis: ["Kis-ing", "Joining"],
  snub: ["Partially Snubbing", "Snubbing"],
  gyro: ["Partially Gyro-ing", "Gyro-ing"],
};

/**
 * Minimal bottom-left text overlay: the polyhedron's name, a ✓ when verified by
 * isomorphism, validity, and the configuration signature. (Visuals are deferred,
 * so identification surfaces here and in the console rather than as real UI.)
 */
export class Readout {
  private polyEl: HTMLElement | null;
  private selEl: HTMLElement | null;
  private poly: Polyhedron | null = null;
  private name: string | null = null;
  private signature: Signature | null = null;
  private selection: Set<number> = new Set();
  private selectionKind: MarkerKind | null = null;
  // Non-null only while a drag is live; `count` is the participating subset size,
  // or null when the operation affects every element of its kind (the whole solid).
  private drag: { kind: OperationKind; weld: boolean; count: number | null } | null = null;
  private verified: boolean = false;
  private invalid: boolean = false;
  private solving: boolean = false;

  constructor() {
    this.polyEl = document.getElementById("poly-readout");
    this.selEl = document.getElementById("sel-readout");
  }

  clear(): void {
    this.poly = null;
    this.name = null;
    this.signature = null;
    this.selection = new Set();
    this.selectionKind = null;
    this.drag = null;
    this.verified = false;
    this.invalid = false;
    this.solving = false;
  }

  show(): void {
    if (!this.polyEl || !this.selEl || !config.features.textReadout || !this.poly || !this.signature) return;
    const title = this.invalid
      ? "X invalid (faces won't planarize)"
      : (this.name ?? "Unknown polyhedron") + (this.verified ? "  ✓" : "");
    const status = this.solving ? "  …relaxing" : "";
    this.polyEl.textContent = `${title}${status}\n${describeSignature(this.signature)}\n`

    let snub = document.createElement("span");
    let gyro = document.createElement("span");
    let canDoSnub = canSnub(this.poly, new Set());
    let canDoGyro = canGyro(this.poly, new Set());
    snub.textContent = `Snub: ${canDoSnub ? "✓" : "X"}  `;
    gyro.textContent = `Gyro: ${canDoGyro ? "✓" : "X"}  `;
    if (!canDoSnub) { snub.className = 'cannotSnubGyro'; }
    if (!canDoGyro) { gyro.className = 'cannotSnubGyro'; }
    this.polyEl.append(snub);
    this.polyEl.append(gyro);

    if (this.drag || this.selection.size > 0) {
      let onFaces = this.selectionKind === "face";
      let verb = "Selected";
      let count = this.selection.size;
      if (this.drag) {
        onFaces = this.drag.kind === "kis" || this.drag.kind === "gyro";
        verb = DRAG_VERB[this.drag.kind][this.drag.weld ? 1 : 0];
        count =
        this.drag.count ?? (onFaces ? this.poly.faces.length : this.poly.vertices.length);
      }
      const noun = plural(onFaces ? "face" : "vertex", count);
      this.selEl.textContent = `${verb} ${count} ${noun}\n`;

      let snub = document.createElement("span");
      let gyro = document.createElement("span");
      let canDoSnub = canSnub(this.poly, this.selection);
      let canDoGyro = canGyro(this.poly, this.selection);
      snub.textContent = `Snub: ${canDoSnub ? "✓" : "X"}  `;
      gyro.textContent = `Gyro: ${canDoGyro ? "✓" : "X"}  `;
      if (!canDoSnub) { snub.className = 'cannotSnubGyro'; }
      if (!canDoGyro) { gyro.className = 'cannotSnubGyro'; }
      if (!onFaces) { this.selEl.append(snub); }
      if ( onFaces) { this.selEl.append(gyro); }
    }
    else {
      this.selEl.textContent = "";
    }
  }

  setPoly(opts: {
    poly: Polyhedron | null;
    name: string | null;
    signature: Signature;
    invalid: boolean;
    solving: boolean;
  }): void {
    this.poly      = opts.poly;
    this.name      = opts.name;
    this.signature = opts.signature;
    this.invalid   = opts.invalid;
    this.solving   = opts.solving;
    this.show();
  }

  updateSelection(selection: Set<number>, kind: MarkerKind | null): void {
    // Called on every hover move, so skip the (graph-traversing) re-render when the
    // effective selection is unchanged.
    if (kind === this.selectionKind && sameSet(selection, this.selection)) return;
    this.selection = selection;
    this.selectionKind = kind;
    this.show();
  }

  /** Reflect an in-progress drag (or pass null when the drag ends). */
  setDrag(drag: { kind: OperationKind; weld: boolean; count: number | null } | null): void {
    this.drag = drag;
    this.show();
  }

  setVerified(verified: boolean): void {
    this.verified = verified;
    this.show();
  }

  setHint(text: string): void {
    if (!this.polyEl || !this.selEl || !config.features.textReadout) return;
    this.polyEl.textContent = text;
    this.selEl.textContent = text;
  }
}
