import { type HistoryEntry } from "../history/history";
import { Screen, Popup } from "./screen";

/** Width of the history panel, in character cells. */
const HISTORY_COLS = 26;

/**
 * Right-side HISTORY panel: a box-drawing popup whose body lists the operations
 * performed. The seed is the first line; each edit below it is prefixed with
 * "└─►" and, if it produced a recognised polyhedron, the name on an indented
 * line in parentheses. Entries after the current point (the redo tail) are
 * dimmed; clicking any entry jumps the app to that state.
 *
 * The box hugs its content height (growing as history grows) and scrolls inside
 * its frame once it would exceed the screen; it re-fits on every screen layout.
 */
export class HistoryPanel {
  private readonly popup: Popup;
  private last: { entries: readonly HistoryEntry[]; current: number } | null = null;

  constructor(
    private readonly screen: Screen,
    private readonly onJump: (index: number) => void,
    // Rows occupied by the bottom-left readout box; the panel caps its height to
    // stop just above it (rather than growing down into it) and scrolls instead.
    private readonly reservedBottomRows: () => number = () => 0,
  ) {
    this.popup = new Popup(screen, { cols: HISTORY_COLS, rows: 3, title: "HISTORY" });
    this.popup.body.classList.add("history-body"); // grid-snapping scroll (see CSS)
    this.popup.mount();
    screen.onLayout(() => this.draw());
  }

  render(entries: readonly HistoryEntry[], current: number): void {
    this.last = { entries, current };
    this.draw();
  }

  /** Size the box to its content (clamped to the screen) and (re)fill its body. */
  private draw(): void {
    if (!this.last) return;
    const s = this.screen;
    const { entries, current } = this.last;

    const cols = Math.min(HISTORY_COLS, Math.max(10, s.cols - 1));
    // Each entry is one label line, plus a name line when it has a resolved name.
    let lines = 0;
    for (const e of entries) lines += 1 + (!e.isSeed && e.name ? 1 : 0);
    // Stop just above the bottom-left readout box rather than growing into it; the
    // body scrolls (snapping to the grid) once the content exceeds this height.
    const maxRows = Math.max(3, s.rows - this.reservedBottomRows());
    const rows = Math.max(3, Math.min(lines + 2, maxRows));

    this.popup.resize(cols, rows);
    this.popup.placeAt(s.cols - cols, 0); // top-right corner

    const body = this.popup.body;
    body.replaceChildren();
    entries.forEach((entry, i) => {
      const item = document.createElement("div");
      item.className = "history-item";
      if (i === current) item.classList.add("current");
      if (i > current) item.classList.add("future");
      if (entry.invalid) item.classList.add("invalid");

      const label = document.createElement("div");
      label.className = "history-label";
      label.textContent = entry.isSeed ? entry.label : `└─► ${entry.label}`;
      item.appendChild(label);

      // Show the resulting shape's name beneath operations (the seed line already
      // *is* its name, so it's not repeated). Invalid states have no name.
      if (!entry.isSeed && entry.name) {
        const name = document.createElement("div");
        name.className = "history-name";
        name.textContent = `(${entry.name})`;
        item.appendChild(name);
      }

      item.addEventListener("click", () => this.onJump(i));
      body.appendChild(item);
    });

    // Keep the active entry in view as the list grows.
    (body.children[current] as HTMLElement | undefined)?.scrollIntoView({ block: "nearest" });
  }
}
