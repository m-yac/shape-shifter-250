import {
  Scene,
  WebGLRenderer,
  Color,
  HemisphereLight,
  DirectionalLight,
  Vector3,
} from "three";
import { config } from "./config";
import { getSeed } from "./geometry/seeds";
import { Polyhedron } from "./geometry/polyhedron";
import { CameraRig } from "./interaction/camera";
import { SceneView } from "./render/sceneView";
import { DragController } from "./interaction/dragController";
import { Readout } from "./ui/readout";

const app = document.getElementById("app")!;

// --- renderer ---------------------------------------------------------------
const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
app.appendChild(renderer.domElement);

const scene = new Scene();
scene.background = new Color(config.render.backgroundColor);

// --- lighting (enough to read the flat-shaded faces) ------------------------
const hemi = new HemisphereLight(0xffffff, 0x404050, 1.0);
scene.add(hemi);
const key = new DirectionalLight(0xffffff, 1.1);
key.position.set(3, 5, 4);
scene.add(key);
const fill = new DirectionalLight(0xffffff, 0.5);
fill.position.set(-4, -2, -3);
scene.add(fill);

// --- camera + view + controller ---------------------------------------------
const rig = new CameraRig(renderer.domElement);
const view = new SceneView(scene);
const readout = new Readout();

let currentSeed: string = config.seeds.initial;
const initialPoly = new Polyhedron(getSeed(currentSeed));
rig.frame(new Vector3());

const controller = new DragController(
  initialPoly,
  view,
  rig.camera,
  rig.controls,
  renderer.domElement,
  readout,
);

// --- seed loading via keyboard ----------------------------------------------
window.addEventListener("keydown", (e) => {
  const enabled = config.seeds.enabled;
  if (config.seeds.numberKeyToLoadSeed && /^[1-9]$/.test(e.key)) {
    const idx = parseInt(e.key, 10) - 1;
    if (idx < enabled.length) {
      currentSeed = enabled[idx];
      controller.load(new Polyhedron(getSeed(currentSeed)));
      rig.frame(new Vector3());
    }
  } else if (e.key.toLowerCase() === config.seeds.resetKey) {
    controller.load(new Polyhedron(getSeed(currentSeed)));
    rig.frame(new Vector3());
  }
});

// --- resize -----------------------------------------------------------------
window.addEventListener("resize", () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  rig.resize();
});

// --- render loop ------------------------------------------------------------
function animate(): void {
  requestAnimationFrame(animate);
  controller.update();
  rig.update();
  renderer.render(scene, rig.camera);
}
animate();
