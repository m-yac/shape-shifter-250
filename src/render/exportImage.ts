import {
  Color,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
  WebGLRenderTarget,
} from "three";
import { config } from "../config";
import { type Polyhedron } from "../geometry/polyhedron";
import { SceneView } from "./sceneView";

/**
 * =============================================================================
 *  IMAGE EXPORT — save the current 3D view as PNG(s).
 * =============================================================================
 *
 *  Two flavors, both of the 3D shape only (no HTML text overlays):
 *    - WYSIWYG: the exact on-screen render (chunky low-res, bloom, dark backlight).
 *    - "light": the same camera, but square, high-res, no bloom and on white —
 *      a clean printable version using the config's `render.light` palette.
 * =============================================================================
 */

/** Lower-case the shape name and turn runs of whitespace into underscores. */
export function fileBase(name: string | null | undefined): string {
  const base = (name ?? "").trim().toLowerCase().replace(/\s+/g, "_");
  return base || "polyhedron";
}

/** Trigger a browser download of a blob (or data URL) under `filename`. */
export function download(data: Blob | string, filename: string): void {
  const url = typeof data === "string" ? data : URL.createObjectURL(data);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  if (typeof data !== "string") URL.revokeObjectURL(url);
}

/**
 * Save the exact on-screen render. Reads the WebGL canvas directly, so the
 * renderer must be created with `preserveDrawingBuffer: true` for this to be
 * reliable regardless of when the click lands relative to the render loop.
 */
export function saveWysiwygPng(renderer: WebGLRenderer, baseName: string): void {
  download(renderer.domElement.toDataURL("image/png"), `${baseName}.png`);
}

/**
 * Save the "light" version: same camera view, but square, high resolution, no
 * bloom (renders straight to a render target, bypassing the bloom composer) and
 * on a white background, using the light palette. Restores every temporary
 * override before returning, so the on-screen frame is untouched.
 */
export function saveLightPng(
  renderer: WebGLRenderer,
  scene: Scene,
  camera: PerspectiveCamera,
  view: SceneView,
  poly: Polyhedron,
  baseName: string,
): void {
  const res = config.render.light.resolution;
  // sRGB texture so the readback is already gamma-encoded (we skip the composer's
  // OutputPass, which would otherwise do that conversion).
  const target = new WebGLRenderTarget(res, res, { samples: 4 });
  target.texture.colorSpace = SRGBColorSpace;

  const restoreView = view.applyExportLight(poly);
  const oldBackground = scene.background;
  const oldAspect = camera.aspect;
  const oldTarget = renderer.getRenderTarget();
  scene.background = new Color(config.render.light.backgroundColor);
  camera.aspect = 1;
  camera.updateProjectionMatrix();

  renderer.setRenderTarget(target);
  renderer.render(scene, camera);
  const buffer = new Uint8Array(res * res * 4);
  renderer.readRenderTargetPixels(target, 0, 0, res, res, buffer);

  // Restore everything before doing the (slower) pixel copy + encode.
  renderer.setRenderTarget(oldTarget);
  camera.aspect = oldAspect;
  camera.updateProjectionMatrix();
  scene.background = oldBackground;
  restoreView();
  target.dispose();

  // GL pixels are bottom-up; flip rows into a 2D canvas, then encode to PNG.
  const canvas = document.createElement("canvas");
  canvas.width = res;
  canvas.height = res;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(res, res);
  const row = res * 4;
  for (let y = 0; y < res; y++) {
    const src = (res - 1 - y) * row;
    img.data.set(buffer.subarray(src, src + row), y * row);
  }
  ctx.putImageData(img, 0, 0);
  canvas.toBlob((blob) => {
    if (blob) download(blob, `${baseName}_light.png`);
  }, "image/png");
}
