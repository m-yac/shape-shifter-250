import { type Signature, describeSignature } from "../identify/configurations";
import { config } from "../config";

/**
 * Minimal bottom-left text overlay: the polyhedron's name, a ✓ when verified by
 * isomorphism, validity, and the configuration signature. (Visuals are deferred,
 * so identification surfaces here and in the console rather than as real UI.)
 */
export class Readout {
  private el: HTMLElement | null;

  constructor() {
    this.el = document.getElementById("readout");
    if (this.el) this.el.style.display = config.features.textReadout ? "block" : "none";
  }

  show(opts: {
    name: string | null;
    signature: Signature;
    verified: boolean;
    invalid: boolean;
    solving: boolean;
  }): void {
    if (!this.el || !config.features.textReadout) return;
    const title = opts.invalid
      ? "✗ invalid (faces won't planarize)"
      : (opts.name ?? "Unknown polyhedron") + (opts.verified ? "  ✓" : "");
    const status = opts.solving ? "  …relaxing" : "";
    this.el.textContent = `${title}${status}\n${describeSignature(opts.signature)}`;
  }

  setHint(text: string): void {
    if (!this.el || !config.features.textReadout) return;
    this.el.textContent = text;
  }
}
