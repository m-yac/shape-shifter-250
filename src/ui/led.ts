/**
 * =============================================================================
 *  LED — the bottom-bezel "working" indicator.
 * =============================================================================
 *
 *  A single red lamp on the bottom bezel that mimics a disk/activity light on an
 *  old computer: lit when the machine is idle, but flicked OFF for one frame
 *  whenever something is "happening" (a character printed to the screen, or the
 *  user dragging), so it blinks rapidly during boot text and while dragging.
 *
 *  It starts dark and only comes alive with the monitor's power-on flash
 *  (`powerOn`, called by the intro). A module-level singleton so any module can
 *  `pulse()` it without threading a reference through every constructor.
 *
 *    pulse()  — mark that activity happened this frame (no-op until powered)
 *    tick()   — call once per frame (from the render loop); applies the blink
 *    powerOn()— first turn-on, with the screen flash
 * =============================================================================
 */
class Led {
  private el: HTMLElement | null = null;
  private powered = false; // dark until the monitor's power-on flash
  private on = false; // current lamp state
  private pending = false; // activity happened since the last tick

  /** Attach the lamp element (built by the bezel controls) and sync its state. */
  setElement(el: HTMLElement): void {
    this.el = el;
    this.apply();
  }

  /** Light the lamp for the first time, together with the screen's power-on flash. */
  powerOn(): void {
    this.powered = true;
    this.on = true;
    this.apply();
  }

  /** Note that something happened this frame (a printed char, a drag move). */
  pulse(): void {
    if (this.powered) this.pending = true;
  }

  /**
   * Apply one frame of the blink. Idle (no pulses) → stays lit. A single pulse →
   * one frame dark then lit again. Continuous pulses (dragging) → alternates every
   * frame, so the lamp flickers rapidly.
   */
  tick(): void {
    if (!this.powered) return;
    if (this.pending && this.on) this.on = false; // a pulse while lit drops it this frame
    else this.on = true; // otherwise (re)light
    this.pending = false;
    this.apply();
  }

  private apply(): void {
    if (this.el) this.el.classList.toggle("on", this.powered && this.on);
  }
}

export const led = new Led();
