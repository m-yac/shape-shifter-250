import { type PerspectiveCamera, type Ray } from "three";
import { type TrackballControls } from "three/examples/jsm/controls/TrackballControls.js";
import { Polyhedron } from "../geometry/polyhedron";
import { type Mesh } from "../geometry/HalfEdge";
import { type MorphPlan } from "../operations/types";
import { buildTruncate, closestIncidentEdge } from "../operations/truncate";
import { buildKis } from "../operations/kis";
import { buildSnub } from "../operations/snub";
import { buildGyro } from "../operations/gyro";
import { RelaxSolver } from "../solver/solver";
import { extractTopology } from "../solver/topology";
import { type Signature, describeSignature } from "../identify/configurations";
import { identify, buildGraphData, namedGraphFor } from "../identify/identify";
import { SceneView, type Marker, type MarkerKind } from "../render/sceneView";
import { Picker } from "./picker";
import { Selection } from "./selection";
import { Readout } from "../ui/readout";
import { config } from "../config";

const DRAG_START_PIXELS = 4;
const IS_MAC = /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);

interface Pending {
  marker: Marker | null;
  shift: boolean;
  multi: boolean;
  x: number;
  y: number;
}

interface Drag {
  plan: MorphPlan;
  kind: MarkerKind;
  id: number;
  allowMax: boolean;
  t: number;
  weld: boolean;
}

/**
 * Glues gestures to operations: hover → highlight; left-drag a vertex/face →
 * build & preview a morph; release → commit, relax, then identify. Cmd/Ctrl
 * drives multi-select. The camera's right-drag orbit is handled separately.
 */
export class DragController {
  private current: Polyhedron;
  private invalid = false;
  private solver: RelaxSolver | null = null;

  private mode: "idle" | "pending" | "dragging" = "idle";
  private pending: Pending | null = null;
  private drag: Drag | null = null;
  private hover: Marker | null = null;
  private hoverInRange = false;
  private hoverRay: Ray | null = null;

  private readonly picker = new Picker();
  private readonly selection = new Selection();

  private worker: Worker | null = null;
  private isoReq = 0;
  private lastName: string | null = null;
  private lastSignature: Signature | null = null;

  constructor(
    initial: Polyhedron,
    private readonly view: SceneView,
    private readonly camera: PerspectiveCamera,
    private readonly controls: TrackballControls,
    private readonly canvas: HTMLCanvasElement,
    private readonly readout: Readout,
  ) {
    this.current = initial;
    if (config.features.isomorphismCheck) {
      this.worker = new Worker(
        new URL("../identify/isoWorker.ts", import.meta.url),
        { type: "module" },
      );
      this.worker.onmessage = (e: MessageEvent<{ id: number; result: boolean }>) =>
        this.onIsoResult(e.data.id, e.data.result);
    }
    this.attach();
    this.view.setPolyhedron(this.current, false);
    this.runIdentify(this.current);
  }

  /** Replace the whole polyhedron (e.g. loading a new seed / reset). */
  load(poly: Polyhedron): void {
    this.solver = null;
    this.invalid = false;
    this.current = poly;
    this.selection.clear();
    this.view.setPolyhedron(poly, false);
    this.runIdentify(poly);
  }

  // ---- frame update --------------------------------------------------------
  update(): void {
    this.view.updateMarkerScales(this.camera, config.camera.startDistance);
    if (this.solver) {
      const working = this.solver.advance();
      this.view.showPreview({
        vertices: this.solver.mesh.vertices,
        faces: this.solver.mesh.faces,
      });
      if (working) this.readout.setHint(`● relaxing: ${this.solver.statusLabel}`);
      else this.finishSolve();
    }
  }

  // ---- listeners -----------------------------------------------------------
  private attach(): void {
    // Capture phase so we can decide (and disable orbit) BEFORE OrbitControls
    // sees the pointerdown.
    this.canvas.addEventListener("pointerdown", (e) => this.onDown(e), true);
    this.canvas.addEventListener("pointermove", (e) => this.onMove(e));
    window.addEventListener("pointerup", (e) => this.onUp(e), true);
    this.canvas.addEventListener("pointerleave", () => {
      if (this.mode !== "idle") return; // don't disturb an in-progress drag
      this.hover = null;
      this.refreshHighlights();
    });
  }

  private allMarkers(): Marker[] {
    return [...this.view.vertexMarkers, ...this.view.faceMarkers];
  }

  private onDown(e: PointerEvent): void {
    if (e.button !== 0) return; // left only; other buttons orbit
    if (this.solver) return; // not interactable while relaxing (orbit still works)
    const marker = this.picker.pick(
      this.allMarkers(),
      e.clientX,
      e.clientY,
      this.canvas,
      this.camera,
    );
    this.pending = {
      marker,
      shift: e.shiftKey,
      multi: (IS_MAC ? e.metaKey : e.ctrlKey) && config.features.multiSelect,
      x: e.clientX,
      y: e.clientY,
    };
    this.mode = "pending";
    // Grabbing a handle suppresses camera orbit; empty space still orbits.
    if (marker) this.controls.enabled = false;
  }

  private onMove(e: PointerEvent): void {
    if (this.mode === "idle") {
      // While the solver is relaxing, nothing is interactable yet (positions are
      // mid-flight), so suppress hover entirely.
      if (config.features.hoverHighlight && !this.solver) {
        const hit = this.picker.pickClosest(
          this.allMarkers(),
          e.clientX,
          e.clientY,
          this.canvas,
          this.camera,
          config.interaction.proximityPixelRadius,
        );
        this.hover = hit?.marker ?? null;
        this.hoverInRange =
          !!hit && hit.pixelDist <= config.interaction.hoverPixelRadius;
        this.hoverRay = this.picker.ray(e.clientX, e.clientY, this.canvas, this.camera);
      } else {
        this.hover = null;
      }
      this.refreshHighlights();
      return;
    }
    if (this.mode === "pending" && this.pending) {
      const moved = Math.hypot(e.clientX - this.pending.x, e.clientY - this.pending.y);
      if (moved > DRAG_START_PIXELS) this.startDrag();
    }
    if (this.mode === "dragging" && this.drag) {
      const ray = this.picker.ray(e.clientX, e.clientY, this.canvas, this.camera);
      const snap = this.drag.plan.snap(ray);
      const thr = config.interaction.magneticThreshold;
      let tEff = snap.t;
      let weld = false;
      if (snap.t <= thr) tEff = 0;
      else if (snap.t >= 1 - thr) {
        if (this.drag.allowMax) {
          tEff = 1;
          weld = true;
        } else tEff = 1 - thr;
      }
      this.drag.t = tEff;
      this.drag.weld = weld;
      const verts = this.drag.plan.positions(tEff);
      this.view.showPreview({ vertices: verts, faces: this.drag.plan.previewFaces });
      this.view.setDragMarker(snap.point); // small sphere on the targeted vertex
      if (snap.highlight) this.view.setEdgeHighlight(snap.highlight.a, snap.highlight.b);
      else this.view.clearEdgeHighlight();
    }
  }

  private startDrag(): void {
    const p = this.pending!;
    if (!p.marker) {
      // Left-drag on empty space does nothing (orbit is the right button).
      this.mode = "idle";
      this.pending = null;
      return;
    }
    const kind = p.marker.kind;
    const id = p.marker.id;

    // Decide the participating selection set (or null = affect everything).
    let sel: Set<number> | null = null;
    if (this.selection.kind === kind && this.selection.ids.size > 0) {
      if (p.multi || this.selection.ids.has(id)) sel = this.selection.setFor(kind);
      else this.selection.clear();
    }

    const built = this.buildPlan(kind, id, p.shift, sel);
    if (!built) {
      this.mode = "idle";
      this.pending = null;
      return;
    }
    this.solver = null; // abandon any in-progress relaxation
    this.drag = { ...built, kind, id, t: 0, weld: false };
    this.mode = "dragging";
    const verts = this.drag.plan.positions(0);
    this.view.showPreview({ vertices: verts, faces: this.drag.plan.previewFaces });
    // The drag marker is positioned on the first move (when we have a snap point).
  }

  private buildPlan(
    kind: MarkerKind,
    id: number,
    shift: boolean,
    sel: Set<number> | null,
  ): { plan: MorphPlan; allowMax: boolean } | null {
    const ops = config.features.operations;
    try {
      if (kind === "vertex") {
        if (shift) {
          if (!ops.snub) return null;
          return { plan: buildSnub(this.current, id, sel), allowMax: false };
        }
        if (!ops.truncate) return null;
        return { plan: buildTruncate(this.current, id, sel), allowMax: ops.rectify };
      } else {
        if (shift) {
          if (!ops.gyro) return null;
          return { plan: buildGyro(this.current, id, sel), allowMax: false };
        }
        if (!ops.kis) return null;
        return { plan: buildKis(this.current, id, sel), allowMax: ops.join };
      }
    } catch (err) {
      console.warn("Operation unavailable:", err);
      return null;
    }
  }

  private onUp(e: PointerEvent): void {
    if (e.button !== 0) {
      this.controls.enabled = true;
      return;
    }
    this.view.clearEdgeHighlight();
    this.view.hideDragMarker();

    if (this.mode === "dragging" && this.drag) {
      const thr = config.interaction.magneticThreshold;
      if (this.drag.t <= thr) {
        // magnetic minimum → discard, no change
        this.view.setPolyhedron(this.current, this.invalid);
      } else {
        const mesh: Mesh = this.drag.plan.commit(this.drag.t, this.drag.weld);
        this.commitPoly(new Polyhedron(mesh));
      }
    } else if (this.mode === "pending" && this.pending) {
      // a click (no drag): selection bookkeeping
      if (this.pending.multi) {
        if (this.pending.marker)
          this.selection.toggle(this.pending.marker.kind, this.pending.marker.id);
        else this.selection.clear();
      } else {
        this.selection.clear();
      }
    }
    this.mode = "idle";
    this.pending = null;
    this.drag = null;
    this.controls.enabled = true; // restore camera orbit
    this.refreshHighlights();
  }

  private commitPoly(poly: Polyhedron): void {
    this.current = poly;
    this.invalid = false;
    if (config.solver.enabled) {
      // Solve on consistently-oriented topology, mutating poly's vertices in place.
      const topo = extractTopology(poly);
      this.solver = new RelaxSolver(poly.mesh.vertices, topo);
      // Green "adjusting" tint signals the shape is relaxing and not yet interactable.
      this.view.setSurfaceColor(config.render.adjustingColor);
      this.readout.setHint(`● relaxing: ${this.solver.statusLabel}`);
    } else {
      this.view.setPolyhedron(poly, false);
      this.runIdentify(poly);
    }
  }

  private finishSolve(): void {
    if (!this.solver) return;
    this.invalid = this.solver.invalid;
    this.solver = null;
    this.view.setPolyhedron(this.current, this.invalid);
    this.runIdentify(this.current);
  }

  // ---- identification ------------------------------------------------------
  private runIdentify(poly: Polyhedron): void {
    const { name, signature } = identify(poly);
    this.lastName = name;
    this.lastSignature = signature;
    this.readout.show({
      name,
      signature,
      verified: false,
      invalid: this.invalid,
      solving: false,
    });
    if (config.features.logToConsole) {
      console.log(
        `[identify] ${this.invalid ? "INVALID — " : ""}${name ?? "Unknown"}\n${describeSignature(signature)}`,
      );
    }
    if (
      !this.invalid &&
      this.worker &&
      config.features.isomorphismCheck &&
      name &&
      poly.dcel.vertices.length <= config.identify.isomorphismMaxVertices
    ) {
      const target = namedGraphFor(name);
      if (target) {
        const id = ++this.isoReq;
        this.worker.postMessage({ id, candidate: buildGraphData(poly), target });
      }
    }
  }

  private onIsoResult(id: number, result: boolean): void {
    if (id !== this.isoReq || !result || !this.lastSignature) return;
    this.readout.show({
      name: this.lastName,
      signature: this.lastSignature,
      verified: true,
      invalid: false,
      solving: false,
    });
    if (config.features.logToConsole) console.log(`[identify] verified ✓ ${this.lastName}`);
  }

  // ---- highlights ----------------------------------------------------------
  private refreshHighlights(): void {
    this.view.resetMarkerStates(); // hide all markers
    this.view.clearEdgeHighlight();
    this.view.clearFaceHighlight();

    if (this.selection.kind) {
      for (const id of this.selection.ids)
        this.view.showMarker(this.selection.kind, id, "selected");
    }
    if (!this.hover || !config.features.hoverHighlight) return;

    const selected = this.selection.isSelected(this.hover.kind, this.hover.id);
    // Within drag range → prominent; merely nearby → subtle proximity hint.
    const state = selected ? "selected" : this.hoverInRange ? "hover" : "proximity";
    this.view.showMarker(this.hover.kind, this.hover.id, state);

    // In range, also preview WHAT would be dragged: the snapped edge (vertex) or
    // the whole face (face center).
    if (this.hoverInRange && this.hoverRay) {
      if (this.hover.kind === "vertex" && config.features.operations.truncate) {
        const e = closestIncidentEdge(this.current, this.hover.id, this.hoverRay);
        // Match the drag tube exactly (current snapped point → rectify max), so the
        // highlight doesn't jump when you click to start dragging.
        this.view.setEdgeHighlight(e.point, e.mid);
      } else if (this.hover.kind === "face" && config.features.operations.kis) {
        const verts = this.current.faces[this.hover.id].map((i) =>
          this.current.vertices[i].clone(),
        );
        this.view.setFaceHighlight(verts);
      }
    }
  }
}
