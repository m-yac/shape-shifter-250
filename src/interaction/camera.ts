import { PerspectiveCamera, type Vector3, MOUSE } from "three";
import { TrackballControls } from "three/examples/jsm/controls/TrackballControls.js";
import { config } from "../config";

/**
 * Perspective camera + orbit controls. Both the left and right buttons orbit the
 * shape; the wheel zooms. When the left button actually grabs a vertex / face,
 * the drag controller temporarily disables these controls (so dragging on empty
 * space rotates, but dragging on a handle performs the operation).
 */
export class CameraRig {
  readonly camera: PerspectiveCamera;
  readonly controls: TrackballControls;

  constructor(domElement: HTMLElement) {
    this.camera = new PerspectiveCamera(
      config.camera.fov,
      window.innerWidth / window.innerHeight,
      0.01,
      1000,
    );
    this.camera.position.set(0, 0, config.camera.startDistance);

    this.controls = new TrackballControls(this.camera, domElement);
    this.controls.dynamicDampingFactor  = 0.12;
    this.controls.rotateSpeed = config.camera.rotateSpeed;
    this.controls.zoomSpeed = config.camera.zoomSpeed;
    this.controls.minDistance = config.camera.minDistance;
    this.controls.maxDistance = config.camera.maxDistance;
    this.controls.mouseButtons = { LEFT: MOUSE.ROTATE };
    // @ts-ignore
    this.controls.domElement?.removeEventListener('contextmenu', this.controls._onContextMenu);
  }

  /** Position the camera a sensible distance for a unit-ish solid. */
  frame(_center: Vector3): void {
    if (!config.camera.autoFrame) return;
    const d = config.camera.startDistance;
    const dir = this.camera.position.clone().normalize();
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
    this.camera.position.copy(dir.multiplyScalar(d));
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  resize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }

  update(): void {
    this.controls.update();
  }
}
