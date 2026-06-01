# STRUCTURE.md

A map of the codebase for someone who needs to make a specific change and wants to
understand *just enough* of the whole before touching one part. The **design intent**
(what each gesture is supposed to do and why) is the design-notes section at the end of
`README.md` — the spec this code implements. This document is about **how the code is
organized and how the pieces talk to each other**.

**Update this file after making a change.**

---

## 1. What this app is

A browser app (TypeScript + Three.js, bundled by Vite) where you sculpt polyhedra by
dragging directly on a single 3D canvas. Dragging a vertex inward truncates;
dragging a face outward kis-es; holding Shift mid-drag morphs those into snub/gyro.
On release the shape is "relaxed" (faces flattened, then regularized), then identified
against a database of named polyhedra.

The whole app is dressed as a vintage CRT monitor: the canvas and all text live inside a
centered "screen" wrapped in a plastic bezel, laid out on a grid of character cells and
finished with a phosphor-green palette, bloom, a pixel mask, and a vignette (see §7).
There is no DOM UI framework — `index.html` is just the static monitor shell; the text
overlays and panels are positioned from JS onto that character grid.

### Run / build / test

```bash
npm run dev      # vite dev server (hot reload), opens the browser
npm run build    # tsc --noEmit type-check, then vite build → dist/
npm test         # vitest run (headless, no browser/Three rendering needed)
npm run test:watch
```

The tests are the fastest feedback loop for anything in `geometry/`, `operations/`,
`solver/`, or `identify/`: those modules are pure (no Three.js rendering, no DOM) and
are exercised directly in `tests/`.

---

## 2. The core mental model (read this before anything else)

### Two representations of a shape

- **`Mesh`** (`src/geometry/HalfEdge.ts`) — the **source of truth**: a flat
  `{ vertices: Vector3[]; faces: number[][] }`, where each face is a loop of vertex
  indices. Plain and serializable. Operations and the solver produce and consume
  `Mesh`es.
- **`DCEL`** (half-edge structure, same file) — **derived, read-only** adjacency data
  built from a `Mesh` by `buildDCEL`. Use it for topology queries (neighbors around a
  vertex, faces around a vertex, twins, edges). You never edit a DCEL; you build a new
  `Mesh` and derive a fresh DCEL.

**`Polyhedron`** (`src/geometry/polyhedron.ts`) wraps a `Mesh` and lazily builds/caches
its DCEL (`.dcel` getter). Treat it as **immutable** — operations return new meshes
that get wrapped in a new `Polyhedron`. (Exception: the solver mutates a mesh's
`Vector3`s in place during relaxation; see §5.)

### Invariants you must not break

- **Face winding is normalized on DCEL build.** `orientFaces` (in `HalfEdge.ts`) rewinds
  all faces so shared edges are traversed in opposite directions and normals point
  outward. So when you author a `Mesh` (e.g. a new seed), faces only need correct
  *membership* — winding is fixed for you.
- **Shapes are normalized to ~unit size.** Seeds are centered at the origin and scaled so
  the farthest vertex is at radius 1 (`normalize` in `seeds.ts`); the solver eases the
  average radius back toward 1 after each edit (`normalizeStep`). Because everything is
  centered at the origin, **a face's outward direction is its centroid direction** — this
  is relied on all over the place to orient Newell normals (search for `n.dot(c) < 0`).
- **Vertex/face ids are only valid for one `Polyhedron`.** Any operation changes topology,
  so after a commit the old ids (and any `Selection`) are meaningless and get cleared.

### The lifecycle of one interaction

```
hover ──► (left-press on a marker) ──► drag ──► release
  │                                     │          │
  │                                     │          ├─► plan.commit(t, weld) → new Mesh
  │                                     │          ├─► new Polyhedron pushed to History
  │                                     │          ├─► RelaxSolver runs across frames
  │                                     │          └─► identify() → name + ✓ verify
  │                                     │
  │                                     └─► each move: plan.snap(ray) → t, then
  │                                         plan.positions(t) previewed live
  │
  └─► hover highlights the draggable handle + previews the range line
```

`DragController` (`src/interaction/dragController.ts`) is the conductor for all of this.
If you only read one file to orient yourself, read that one — it wires gestures to
operations, manages selection/history/solver/identify, and owns the drag state machine
(`idle` → `pending` → `dragging`).

### The operation contract: `MorphPlan`

Every interactive operation is a **`MorphPlan`** (`src/operations/types.ts`). A plan is
*built once at drag start* with the topology frozen, and then only its parameter `t ∈
[0,1]` varies during the drag:

```ts
interface MorphPlan {
  kind: "truncate" | "kis" | "snub" | "gyro";
  previewFaces: number[][];                 // topology shown DURING the drag (un-welded)
  positions(t): Vector3[];                  // vertex positions at parameter t
  snap(ray): { t, point, highlight? };      // project the camera ray onto the snap geometry
  commit(t, weld): Mesh;                     // final mesh; weld=true collapses to the "max" form
}
```

- `t = 0` is a geometric no-op (identical to the original); `t = 1` is the "max" form
  (Rectify / Join / welded snub/gyro).
- `snap` maps the mouse pick ray onto the operation's snap geometry (an incident edge for
  vertex ops, the face normal line for kis, the centre→edge-midpoint lines for gyro),
  and reports the resulting `t`, the exact world point the handle should sit at, and a
  segment to draw as the "range line".
- `commit(t, weld)` returns the committed `Mesh`. When `weld` is true the topology
  collapses to the max form via `weldVertexPairs` (`operations/weld.ts`) or a custom
  face-merge.

`buildTruncate`, `buildKis`, `buildSnub`, `buildGyro` are the four factories. They all
follow the same shape: default to operating on **every** vertex/face (the dragged
element is just the handle controlling a global parameter), with an optional `selected`
subset for multi-select.

---

## 3. Directory map

```
index.html              Static monitor shell: #bezel ▸ #screen ▸ #grid (canvas + #readout + #crt). All CRT CSS + theme variables. Panels are built in JS.
src/
  main.ts               Bootstrap: Screen, renderer + bloom/pixelate post-processing, lights, camera, SceneView, DragController; key bindings.
  config.ts             SINGLE source of truth for every tunable + feature flag. Start here to change behavior.

  geometry/             Pure shape representation + math. No Three rendering.
    HalfEdge.ts         Mesh + DCEL types, orientFaces, buildDCEL, topology queries (the foundation).
    polyhedron.ts       Polyhedron class; face centroid/normal (Newell) helpers; meshRadius; cloneMesh.
    seeds.ts            The 5 Platonic seeds, normalize(), dual().

  operations/           The four interactive Conway operations, each a MorphPlan factory.
    types.ts            OperationKind + the MorphPlan interface (the contract above).
    truncate.ts         Truncate ↔ Rectify (drag vertex in). Also closestIncidentEdge (used by hover).
    kis.ts              Kis ↔ Join (drag face out). joinHeight/smallestPositiveRoot solve coplanarity.
    snub.ts             Snub (Shift + drag a 2n-degree vertex). Chirality via face 2-coloring. + canSnub.
    gyro.ts             Gyro (Shift + drag a 2n-gon face). Dual of snub; vertex 2-coloring. + canGyro.
    weld.ts             weldVertexPairs: union-find merge of coincident vertices → the "max" topology.

  solver/               Post-release relaxation. Pure; runs incrementally across frames.
    topology.ts         extractTopology: the fixed connectivity the solver needs (oriented faces, edges, ...).
    solver.ts           RelaxSolver state machine: planarize → regularize, with anti-collapse escalation.
    planarize.ts        planarizeStep: pull each face's verts onto its best-fit plane.
    regularize.ts       Three strategies (regular faces / canonical-midsphere / spherize) + normalizeStep.

  identify/             Naming + verification. The iso check half can run in a Web Worker.
    configurations.ts   Vertex/face configuration strings (canonical, e.g. "3.4.3.4"); Signature + equality.
    identify.ts         identify(): match a Signature against the named DB; buildGraphData for iso check.
    isomorphism.ts      areIsomorphic: label-pruned backtracking graph iso (pure, worker-safe).
    isoWorker.ts         Web Worker entry that calls areIsomorphic off the main thread.

  data/
    namedPolyhedra.ts   The named-polyhedron database, mostly generated by applying our ops to seeds.

  interaction/          Input → intent. Mouse, picking, selection, camera.
    dragController.ts   THE orchestrator (see §2). Hover/drag state machine, commit, solve, identify.
    picker.ts           Screen-space marker picking + facesCamera occlusion test + ray construction.
    selection.ts        Multi-select set (homogeneous: vertices OR faces).
    camera.ts           CameraRig: PerspectiveCamera + ArcballControls.

  render/
    sceneView.ts        Owns all Three.js objects: face mesh, wireframe, markers, drag tube, highlights.

  ui/
    screen.ts           The CRT monitor + character grid: Screen (bezel/glass, grid math, layout, theme→CSS vars), Popup, text/box-drawing helpers.
    readout.ts          Bottom-left status overlay (name, ✓, signature, snub/gyro availability, drag/selection).
    historyPanel.ts     Right-side HISTORY popup: clickable operation list inside a box-drawing frame.

  history/
    history.ts          Linear undo/redo timeline of committed Polyhedron states.

  util/
    lines.ts            closestLineParam + distancePointToRay (the snapping math).

tests/                  vitest. geometry / operations / solver / identify. Pure-module coverage.
```

---

## 4. How the operations work (the heart of the app)

All four live in `src/operations/` and produce a `MorphPlan`. Shared shape:

1. Decide the participating set (the `selected` subset, or everything; the dragged
   handle is always added).
2. Index the new vertices: typically one "cut" vertex per relevant half-edge, plus the
   untouched originals. `positions(t)` interpolates the cut vertices along their edges /
   normals as a function of `t`.
3. Build `previewFaces` (the un-welded intermediate topology).
4. Precompute `weldPairs` (or a face-merge function) for the `commit(t, weld=true)` max.
5. `snap(ray)` finds the closest snap line to the pick ray and converts the projected
   parameter into `t`.

Operation-specific notes:

- **Truncate** (`truncate.ts`): each truncated origin gets one cut vertex per outgoing
  half-edge at fraction `t·0.5`. At `t=1` the two cuts on a fully-truncated edge meet at
  the midpoint → those pairs are welded → Rectify. `closestIncidentEdge` is exported and
  reused by the controller's hover preview.
- **Kis** (`kis.ts`): raises a pyramid apex over each face along its outward normal. The
  max height per face is the **join height** — the apex rise at which adjacent pyramid
  triangles become coplanar and merge into a quad (solved by `joinHeight` →
  `smallestPositiveRoot`). `weld=true` merges those triangles → Join.
- **Snub** (`snub.ts`): same handle as truncate but skews the cut ring into a central
  n-gon + ear triangles. **Chirality** comes from a 2-coloring of the faces in the
  selected region; the two colorings are the two mirror forms, and `snap` picks whichever
  makes the edge under the cursor "outer". Requires the region to be edge-connected and
  2-colorable (no odd cycle — which also rules out odd-degree vertices); otherwise
  `buildSnub` throws and the controller treats Shift as inert. `canSnub` mirrors these
  preconditions for the readout.
- **Gyro** (`gyro.ts`): the dual of snub on faces. Splits the kis apex into a central
  degree-n vertex + n peripheral vertices that slide out along centre→edge-midpoint
  lines. Chirality from a 2-coloring of the **vertices** of the region. `canGyro` mirrors
  preconditions. Note the welded max here is a custom `weldedFaces` face-merge, not
  `weldVertexPairs`.

**`baseT`**: snub/gyro are built *mid-drag* when Shift is pressed, frozen at the base
op's current level (`drag.t`). `baseT` seeds the starting cut/apex so pressing Shift
changes nothing until the mouse moves; the skew then interpolates out of that frozen
state. Whether the result welds (full vs "partial" snub/gyro) is **inherited** from the
base op's weld state, not from reaching `t=1`.

---

## 5. The solver (post-release relaxation)

After a commit, `DragController.commitPoly` constructs a `RelaxSolver` over the new mesh
and calls `advance()` once per animation frame (in `DragController.update`) until it
returns false. The solver **mutates the committed mesh's `Vector3`s in place**, so by the
time it finishes the `Polyhedron` already holds the relaxed geometry (this is why
undo/redo can just re-show a stored state without re-solving). While relaxing, the
surface is tinted (`config.render.adjustingColor`) and the shape is not interactable.

Two phases (`solver.ts`):

1. **Planarize** (`planarize.ts`): pull each face's vertices onto its best-fit plane. If
   the max out-of-plane distance never drops below tolerance within the iteration/time
   budget, the shape is declared **invalid** (`config.solver.invalidOnTimeout`).
2. **Regularize** (`regularize.ts`): with damping over time, nudge toward regularity while
   keeping faces flat and easing scale back to target. An **anti-collapse escalation**
   switches strategy based on the minimum adjacent-face angle:
   `regular faces → canonical/midsphere → spherize` (canonical is sticky — it never falls
   back to faces). The thresholds live in `config.solver.regularity.coplanar`.

The manual debug keys (`g`/`f`/`c`/`v`, see `config.debug` and `main.ts`) re-run the
solver on the current shape, optionally locking one strategy — useful for watching a
single step in isolation.

---

## 6. Identification

After relaxation, `identify()` (`identify/identify.ts`) computes a **`Signature`**
(`configurations.ts`): V/E/F counts plus histograms of canonical vertex- and
face-configuration strings (e.g. `"3.4.3.4"`, canonicalized so rotation/reflection don't
matter). It compares that signature against the precomputed signatures of the **named
database** (`data/namedPolyhedra.ts`) and returns the first match's name.

A signature match is only a *necessary* condition, so a **background graph-isomorphism**
check (`isomorphism.ts`, run in `isoWorker.ts` off the main thread) verifies an actual
configuration- and adjacency-preserving bijection exists; success shows the ✓ in the
readout. Gated by `config.features.isomorphismCheck` and
`config.identify.isomorphismMaxVertices`.

The named database is interesting: rather than hand-entering coordinates, most entries
are **generated by applying this app's own operations to the Platonic seeds** (e.g.
`Cuboctahedron = rectify(cube)`), since identification only needs correct connectivity.

---

## 7. Rendering, the screen & input

### The screen (the CRT shell)

- **`Screen`** (`ui/screen.ts`) owns the monitor: the `#bezel`/`#screen` elements and the
  **character grid** inside the glass. On startup and every window resize it fits the
  largest whole-cell rectangle the window allows — a cell is `colW`×`rowH` (16×38 px), the
  AST PremiumExec PC font drawn at 2× — then notifies its `onLayout` subscribers so the
  renderer, the post-processing composer, the camera aspect, and the panels all re-fit to
  the new grid. Everything on screen (text **and** the 3D canvas) is positioned in cell
  units via `place` / `placeAnchored`, so plain HTML divs line up like characters on a
  terminal. It also pushes all of `config.theme` to CSS custom properties (`applyTheme`).
- **`Popup`** (same file) is a grid-aligned box-drawing frame (a `<pre>` border) with a
  separate scrollable interior — used for panels like HISTORY. `boxLines` / `centered` /
  `fit` build the frame text; `textGlow` builds the CSS phosphor-bloom text-shadow.
- **Phosphor look**: `main.ts` renders the scene through an `EffectComposer` with an
  `UnrealBloomPass` so the polyhedra get the same halo the text gets from `textGlow` —
  both scaled by `config.theme.bloom.intensity`, so they read as one bloom. With
  `config.theme.pixelateRender`, the WebGL buffer is rendered at one texel per font pixel
  and nearest-neighbor upscaled so the 3D shares the text's chunky pixel grid; the cell
  size is an exact multiple of the pixel size, so the upscale is integer. A click-through
  CSS overlay (`#crt`) lays the pixel mask and corner vignette over everything.

### Rendering & input

- **`SceneView`** owns every Three.js object for the current shape: the fan-triangulated
  face mesh (one Newell normal per face — re-oriented outward via the centroid convention
  so faces that operations emit with reversed winding still shade lit-side-out), the
  wireframe, the pickable vertex/face-center **markers**, the white "range line" tube, the
  small drag marker, and the translucent face highlight. During a drag it shows a transient
  preview mesh (markers hidden) and rebuilds on commit. Markers auto-rescale each frame so
  their on-screen size is constant regardless of zoom.
- **`Picker`** does hover/pick detection in **screen space** (a pixel radius, so it's
  forgiving), and culls handles whose faces all point away from the camera
  (`facesCamera`) — you can't grab a handle on the far/silhouette side. It also builds
  the world-space pick ray that operations snap against.
- **`CameraRig`** is an `ArcballControls` orbit camera; both mouse buttons orbit and the
  wheel zooms. Its aspect follows the screen (`setAspect`, called on every layout) rather
  than the window. When a left-press grabs a marker, the controller disables the controls
  so the drag performs an operation instead of orbiting.

---

## 8. Configuration & feature flags

`src/config.ts` is the single source of truth for **every** tunable and on/off switch:
which operations are enabled, interaction radii, the full solver schedule, render colors
and sizes, the CRT screen geometry (`config.screen`) and phosphor theme (`config.theme`),
seeds, camera, and debug keys. It is a `const` object (typed `as const`).
Before adding a magic number anywhere, check whether it belongs here — most behavior is
meant to be adjustable from this one file.

---

## 9. "I need to change X" — where to start

| Goal | Start here |
| --- | --- |
| Add a new seed solid | Add a `Mesh` in `geometry/seeds.ts` (membership-only faces), register it in `SEEDS`, and add its name to `config.seeds.enabled`. |
| Add a recognizable named polyhedron | Add an entry to `NAMED` in `data/namedPolyhedra.ts` — ideally via a recipe (`rectify(seed("cube"))`) so connectivity is guaranteed correct. |
| Tweak feel/colors/thresholds | `config.ts`. Almost certainly only this file. |
| Change how the post-release shape settles | `solver/solver.ts` (the phase/strategy state machine) + `solver/regularize.ts` (the strategies) + `config.solver`. |
| Add a brand-new interactive operation | Implement a `MorphPlan` factory in `operations/` (mirror `truncate.ts`), then wire it into `DragController.buildPlan`, the gesture routing, and `config.features.operations`. |
| Change drag/hover/selection behavior | `interaction/dragController.ts` (orchestration) and `interaction/picker.ts` / `selection.ts`. |
| Change what the markers/preview/highlights look like | `render/sceneView.ts`. |
| Change the on-screen text / history list | `ui/readout.ts` (status text), `ui/historyPanel.ts` (the HISTORY popup), and the `.gui` / `.popup` / `.history-item` styles in `index.html`. Both build on the grid/popup machinery in `ui/screen.ts`. |
| Change the CRT look (frame, glow, pixelation, colors) | `config.theme` + `config.screen` first; then the monitor-shell CSS in `index.html`, the bloom/pixelate pipeline in `main.ts`, and the grid math in `ui/screen.ts`. |
| Change identification / verification | `identify/configurations.ts` (signatures), `identify/identify.ts` (matching), `identify/isomorphism.ts` (verify). |
| Add topology queries | `geometry/HalfEdge.ts` — extend the DCEL query helpers there. |

### A few gotchas

- The dragged element is a **handle**, not the sole target: by default operations act on
  the whole solid. Multi-select restricts the set, but the parameter→geometry mapping
  (the Rectify/Join bound) is computed as if everything participated.
- `Polyhedron` is effectively immutable except for the solver's in-place vertex mutation
  during relaxation. Don't mutate a committed mesh elsewhere.
- After any commit the selection and all vertex/face ids are invalidated (topology
  changed) — the controller clears the selection for you.
- Face winding is *not* something you control when authoring meshes — `orientFaces` fixes
  it. But it means a freshly built mesh's stored winding may differ from what you wrote,
  which is why outward normals are re-derived from the centroid direction wherever they
  matter.
- The isomorphism check is async and best-effort (worker + vertex cap); the name appears
  immediately from the signature match, the ✓ arrives later.
