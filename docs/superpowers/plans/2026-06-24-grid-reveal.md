# Grid Reveal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a second image generator, "Grid Reveal", where two full-viewport images (Top overlay / Bottom beneath) are revealed cell-by-cell through an m×n grid — click a cell to flip which image shows, drag to pan the revealed image; grid strips are equal or random (re-rollable).

**Architecture:** A new `grid-reveal` generator under `src/generators/`, mirroring the `swap-collage` structure (reducer + pure `layout.ts` + Provider + Preview + Controls), registered in `src/app/registry.ts`. Rendering uses Approach 2 from the spec: every cell clips and draws its image at viewport coordinates, so each image reads as one continuous picture. Pointer interaction on a single transparent hit-layer rect distinguishes click (flip) from drag (pan) by a movement threshold. Pure modules (`layout.ts`, `gridRevealReducer.ts`) are TDD; React/Konva components are verified by typecheck/build/manual run, matching how swap-collage is tested today.

**Tech Stack:** React 19, react-konva 9 / konva 10, TypeScript, Vitest, shadcn/ui, lucide-react.

**Spec:** `docs/superpowers/specs/2026-06-24-grid-reveal-design.md`

**Refinement vs. spec (decided during planning):** The shared `ImageSlotControls` component requires `zoom` + `filters` props, but Grid Reveal v1 is pan-only with no filters (out of scope). So Grid Reveal does NOT reuse `ImageSlotControls`; it uses a lean local `SourceControl` (Button + hidden file input + clear) copied from that component's pattern. `ExportControls`, `useFileDrop`, `useImageBitmap`, `coverFit`, `containFit`, `canvasDims`, and `exportStage` ARE reused.

---

## File map

- **Create** `src/generators/grid-reveal/layout.ts` — pure geometry: strips, cell rects, placement, hit-test, border lines, constants. (Task 1)
- **Create** `src/lib/__tests__/grid-reveal-layout.test.ts` — unit tests for `layout.ts`. (Task 1)
- **Create** `src/generators/grid-reveal/gridRevealReducer.ts` — state + actions. (Task 2)
- **Create** `src/generators/grid-reveal/__tests__/gridRevealReducer.test.ts` — unit tests. (Task 2)
- **Modify** `src/export.ts` — add optional `prefix` arg to `exportStage`. (Task 3)
- **Modify** `src/__tests__/export.test.ts` — prefix tests. (Task 3)
- **Create** `src/generators/grid-reveal/GridRevealProvider.tsx` — context (Task 4)
- **Create** `src/generators/grid-reveal/GridRevealPreview.tsx` — Konva stage (Task 5)
- **Create** `src/generators/grid-reveal/GridRevealControls.tsx` — sidebar (Task 6)
- **Create** `src/generators/grid-reveal/index.ts` — generator object (Task 7)
- **Modify** `src/app/registry.ts` — register the generator (Task 7)
- **Modify** `CONTEXT.md` — append Grid Reveal language (Task 8)

---

## Task 1: Pure geometry module (`layout.ts`)

**Files:**
- Create: `src/generators/grid-reveal/layout.ts`
- Test: `src/lib/__tests__/grid-reveal-layout.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/__tests__/grid-reveal-layout.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  BORDER_COLOR,
  BORDER_OPACITY,
  BORDER_WIDTH,
  MIN_STRIP_MULT,
  MAX_STRIP_MULT,
  IDENTITY_XFORM,
  cellRects,
  hitTest,
  placement,
  rollStrips,
  splitLines,
  uniformStrips,
} from "../../generators/grid-reveal/layout";

describe("uniformStrips", () => {
  it("partitions 1 into n equal strips", () => {
    expect(uniformStrips(4)).toEqual([0.25, 0.25, 0.25, 0.25]);
    expect(uniformStrips(4).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
  });

  it("returns [] for n <= 0", () => {
    expect(uniformStrips(0)).toEqual([]);
  });
});

describe("rollStrips", () => {
  it("returns n positive strips summing to 1", () => {
    const strips = rollStrips(5);
    expect(strips).toHaveLength(5);
    strips.forEach((s) => expect(s).toBeGreaterThan(0));
    expect(strips.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
  });

  it("produces a deterministic clamped partition for a seeded rng", () => {
    // rng sequence 0,1,0,1 → raw = [lo, hi, lo, hi]; for n=4 unit=0.25,
    // lo=0.125, hi=0.375, sum=1.0 so normalized == raw.
    const seq = [0, 1, 0, 1];
    let i = 0;
    const rng = () => seq[i++] ?? 0;
    expect(rollStrips(4, rng)).toEqual([0.125, 0.375, 0.125, 0.375]);
  });

  it("keeps every raw draw within [MIN,MAX]·unit before normalization", () => {
    // With rng returning the min endpoint each call, every raw draw == lo.
    const unit = 1 / 4;
    const lo = MIN_STRIP_MULT * unit;
    const hi = MAX_STRIP_MULT * unit;
    expect(lo).toBeLessThan(hi);
    const strips = rollStrips(4, () => 0);
    // all equal (constant rng) → uniform
    expect(strips).toEqual([0.25, 0.25, 0.25, 0.25]);
  });
});

describe("cellRects", () => {
  it("tiles the canvas into rows×cols rects with no gaps", () => {
    const grid = cellRects(uniformStrips(2), uniformStrips(2), 100, 100);
    expect(grid).toEqual([
      [
        { x: 0, y: 0, w: 50, h: 50 },
        { x: 50, y: 0, w: 50, h: 50 },
      ],
      [
        { x: 0, y: 50, w: 50, h: 50 },
        { x: 50, y: 50, w: 50, h: 50 },
      ],
    ]);
  });

  it("total cell area equals the canvas area", () => {
    const grid = cellRects(uniformStrips(3), uniformStrips(2), 90, 60);
    const area = grid.flat().reduce((a, c) => a + c.w * c.h, 0);
    expect(area).toBeCloseTo(90 * 60, 6);
  });
});

describe("hitTest", () => {
  const cols = uniformStrips(2);
  const rows = uniformStrips(2);
  it("maps a point to its cell", () => {
    expect(hitTest(10, 10, cols, rows, 100, 100)).toEqual({ row: 0, col: 0 });
    expect(hitTest(60, 10, cols, rows, 100, 100)).toEqual({ row: 0, col: 1 });
    expect(hitTest(10, 60, cols, rows, 100, 100)).toEqual({ row: 1, col: 0 });
  });
  it("returns null off-canvas", () => {
    expect(hitTest(-1, 10, cols, rows, 100, 100)).toBeNull();
    expect(hitTest(10, -1, cols, rows, 100, 100)).toBeNull();
    expect(hitTest(101, 10, cols, rows, 100, 100)).toBeNull();
  });
  it("clamps the far boundary into the last cell", () => {
    expect(hitTest(100, 100, cols, rows, 100, 100)).toEqual({ row: 1, col: 1 });
  });
});

describe("placement", () => {
  it("cover-fits and centers at panX/panY = 0.5", () => {
    // image 200×100 into 100×100 → scale 1, imgW 200, imgH 100
    const p = placement(200, 100, 100, 100, IDENTITY_XFORM);
    expect(p).toEqual({ x: -50, y: 0, width: 200, height: 100 });
  });
  it("always covers the viewport at pan extremes", () => {
    const lo = placement(200, 100, 100, 100, { panX: 0, panY: 0 });
    expect(lo.x).toBe(0); // left edge visible, right covered
    const hi = placement(200, 100, 100, 100, { panX: 1, panY: 1 });
    expect(hi.x).toBe(-100); // right edge visible, left covered
  });
});

describe("splitLines", () => {
  it("returns interior boundary positions", () => {
    expect(splitLines(uniformStrips(3), 90)).toEqual([30, 60]);
  });
  it("returns none for a single strip", () => {
    expect(splitLines(uniformStrips(1), 100)).toEqual([]);
  });
});

describe("constants", () => {
  it("exposes the agreed border constants", () => {
    expect(BORDER_COLOR).toBe("#888888");
    expect(BORDER_OPACITY).toBe(0.5);
    expect(BORDER_WIDTH).toBe(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/__tests__/grid-reveal-layout.test.ts`
Expected: FAIL — module `../../generators/grid-reveal/layout` not found.

- [ ] **Step 3: Implement `layout.ts`**

Create `src/generators/grid-reveal/layout.ts`:

```ts
// src/generators/grid-reveal/layout.ts
import type { Rect } from "@/lib/geometry";
import { coverFit } from "@/lib/canvas/fit";

/** Random-strip clamp multipliers, as a fraction of the uniform strip (1/n). */
export const MIN_STRIP_MULT = 0.5;
export const MAX_STRIP_MULT = 1.5;

/** Border look — always drawn, baked into the export. */
export const BORDER_COLOR = "#888888";
export const BORDER_OPACITY = 0.5;
export const BORDER_WIDTH = 2; // logical px (NOT divided by stage scale)

export interface Transform {
  panX: number; // [0,1], 0.5 = centered
  panY: number; // [0,1], 0.5 = centered
}

export const IDENTITY_XFORM: Transform = { panX: 0.5, panY: 0.5 };

/** n uniform strips summing to 1. */
export function uniformStrips(n: number): number[] {
  if (n <= 0) return [];
  const w = 1 / n;
  return Array.from({ length: n }, () => w);
}

/**
 * Random partition of 1 into n strips. Each raw draw is clamped to
 * [MIN_STRIP_MULT/n, MAX_STRIP_MULT/n] then the set is renormalized to sum 1.
 * `rng` is injected so tests are deterministic (defaults to Math.random).
 */
export function rollStrips(n: number, rng: () => number = Math.random): number[] {
  if (n <= 0) return [];
  const unit = 1 / n;
  const lo = MIN_STRIP_MULT * unit;
  const hi = MAX_STRIP_MULT * unit;
  const raw = Array.from({ length: n }, () => lo + rng() * (hi - lo));
  const sum = raw.reduce((a, b) => a + b, 0);
  return raw.map((w) => w / sum);
}

/** Cumulative pixel origins (length n+1) for fractional strips over `len`. */
function origins(strips: number[], len: number): number[] {
  const acc: number[] = [0];
  let pos = 0;
  for (const s of strips) {
    pos += s * len;
    acc.push(pos);
  }
  return acc;
}

/** [rows][cols] pixel rects tiling the (cw × ch) canvas — no gaps, no overlap. */
export function cellRects(
  colStrips: number[],
  rowStrips: number[],
  cw: number,
  ch: number,
): Rect[][] {
  const xs = origins(colStrips, cw);
  const ys = origins(rowStrips, ch);
  const grid: Rect[][] = [];
  for (let r = 0; r < rowStrips.length; r++) {
    const row: Rect[] = [];
    for (let c = 0; c < colStrips.length; c++) {
      row.push({ x: xs[c], y: ys[r], w: xs[c + 1] - xs[c], h: ys[r + 1] - ys[r] });
    }
    grid.push(row);
  }
  return grid;
}

/** Which cell a logical-canvas point (x, y) falls in, or null if off-canvas. */
export function hitTest(
  x: number,
  y: number,
  colStrips: number[],
  rowStrips: number[],
  cw: number,
  ch: number,
): { row: number; col: number } | null {
  if (x < 0 || y < 0 || x > cw || y > ch) return null;
  const xs = origins(colStrips, cw);
  const ys = origins(rowStrips, ch);
  let col = 0;
  for (let i = 1; i < xs.length; i++) {
    if (x >= xs[i]) col = i;
    else break;
  }
  if (colStrips.length > 0) col = Math.min(col, colStrips.length - 1);
  let row = 0;
  for (let i = 1; i < ys.length; i++) {
    if (y >= ys[i]) row = i;
    else break;
  }
  if (rowStrips.length > 0) row = Math.min(row, rowStrips.length - 1);
  return { row, col };
}

/**
 * Cover-fit placement of an (iw × ih) image inside the (cw × ch) viewport,
 * panned by xform. x = -(imgW - cw)·panX so panX=0 shows the left edge,
 * panX=1 the right edge, 0.5 centered. Always fully covers the viewport.
 */
export function placement(
  iw: number,
  ih: number,
  cw: number,
  ch: number,
  xform: Transform,
): { x: number; y: number; width: number; height: number } {
  const { scale } = coverFit(iw, ih, cw, ch);
  const imgW = iw * scale;
  const imgH = ih * scale;
  return {
    x: -(imgW - cw) * xform.panX,
    y: -(imgH - ch) * xform.panY,
    width: imgW,
    height: imgH,
  };
}

/** Interior strip-boundary pixel positions along one axis, for drawing lines. */
export function splitLines(strips: number[], len: number): number[] {
  return origins(strips, len).slice(1, -1);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/__tests__/grid-reveal-layout.test.ts`
Expected: PASS (all tests green).

- [ ] **Step 5: Commit**

```bash
git add src/generators/grid-reveal/layout.ts src/lib/__tests__/grid-reveal-layout.test.ts
git commit -m "feat(grid-reveal): pure geometry module (strips, cells, placement, hit-test)"
```

---

## Task 2: State reducer (`gridRevealReducer.ts`)

**Files:**
- Create: `src/generators/grid-reveal/gridRevealReducer.ts`
- Test: `src/generators/grid-reveal/__tests__/gridRevealReducer.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/generators/grid-reveal/__tests__/gridRevealReducer.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  DEFAULT_COLS,
  DEFAULT_ROWS,
  gridRevealReducer,
  initialGridRevealState,
  type GridRevealAction,
} from "../gridRevealReducer";
import { uniformStrips } from "../layout";

describe("initialGridRevealState", () => {
  it("defaults to equal grid with all cells showing Top (false)", () => {
    expect(initialGridRevealState.mode).toBe("equal");
    expect(initialGridRevealState.cols).toBe(DEFAULT_COLS);
    expect(initialGridRevealState.rows).toBe(DEFAULT_ROWS);
    expect(initialGridRevealState.colStrips).toEqual(uniformStrips(DEFAULT_COLS));
    expect(initialGridRevealState.cells.every((r) => r.every((v) => v === false))).toBe(true);
  });
});

describe("FLIP_CELL", () => {
  it("toggles one cell", () => {
    const next = gridRevealReducer(initialGridRevealState, {
      type: "FLIP_CELL",
      row: 0,
      col: 0,
    } as GridRevealAction);
    expect(next.cells[0][0]).toBe(true);
    expect(next.cells[0][1]).toBe(false);
  });

  it("is a no-op out of bounds", () => {
    const next = gridRevealReducer(initialGridRevealState, {
      type: "FLIP_CELL",
      row: 99,
      col: 99,
    } as GridRevealAction);
    expect(next).toEqual(initialGridRevealState);
  });
});

describe("SET_COLS / SET_ROWS", () => {
  it("SET_COLS regenerates colStrips and resets cells to all-Top", () => {
    const next = gridRevealReducer(initialGridRevealState, {
      type: "SET_COLS",
      cols: 6,
    } as GridRevealAction);
    expect(next.cols).toBe(6);
    expect(next.colStrips).toHaveLength(6);
    expect(next.cells[0]).toHaveLength(6);
    expect(next.cells.every((r) => r.every((v) => !v))).toBe(true);
  });

  it("SET_ROWS regenerates rowStrips and resets cells", () => {
    const next = gridRevealReducer(initialGridRevealState, {
      type: "SET_ROWS",
      rows: 5,
    } as GridRevealAction);
    expect(next.rows).toBe(5);
    expect(next.rowStrips).toHaveLength(5);
    expect(next.cells).toHaveLength(5);
  });
});

describe("SET_MODE", () => {
  it("regenerates strips when switching to random and preserves cells", () => {
    const flipped = gridRevealReducer(initialGridRevealState, {
      type: "FLIP_CELL",
      row: 0,
      col: 0,
    } as GridRevealAction);
    const next = gridRevealReducer(flipped, {
      type: "SET_MODE",
      mode: "random",
    } as GridRevealAction);
    expect(next.mode).toBe("random");
    expect(next.cells[0][0]).toBe(true); // preserved
    // random strips need not be uniform
    expect(next.colStrips).not.toEqual(uniformStrips(next.cols));
  });

  it("is a no-op (same ref) when mode is unchanged", () => {
    const next = gridRevealReducer(initialGridRevealState, {
      type: "SET_MODE",
      mode: "equal",
    } as GridRevealAction);
    expect(next).toBe(initialGridRevealState);
  });
});

describe("REROLL", () => {
  it("is a no-op (same ref) in equal mode", () => {
    const next = gridRevealReducer(initialGridRevealState, { type: "REROLL" } as GridRevealAction);
    expect(next).toBe(initialGridRevealState);
  });

  it("regenerates strips in random mode", () => {
    const rand = gridRevealReducer(initialGridRevealState, {
      type: "SET_MODE",
      mode: "random",
    } as GridRevealAction);
    const next = gridRevealReducer(rand, { type: "REROLL" } as GridRevealAction);
    expect(next.colStrips).toHaveLength(rand.cols);
    expect(next.colStrips.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
  });
});

describe("SET_XFORM", () => {
  it("clamps pan into [0,1]", () => {
    const next = gridRevealReducer(initialGridRevealState, {
      type: "SET_XFORM",
      slot: "top",
      xform: { panX: -5, panY: 99 },
    } as GridRevealAction);
    expect(next.xformTop).toEqual({ panX: 0, panY: 1 });
  });

  it("writes Bottom slot", () => {
    const next = gridRevealReducer(initialGridRevealState, {
      type: "SET_XFORM",
      slot: "bottom",
      xform: { panX: 0.2, panY: 0.8 },
    } as GridRevealAction);
    expect(next.xformBottom).toEqual({ panX: 0.2, panY: 0.8 });
  });
});

describe("SET_ASPECT", () => {
  it("resets both transforms to centered", () => {
    const moved = gridRevealReducer(initialGridRevealState, {
      type: "SET_XFORM",
      slot: "top",
      xform: { panX: 0, panY: 0 },
    } as GridRevealAction);
    const next = gridRevealReducer(moved, {
      type: "SET_ASPECT",
      aspect: "16:9",
    } as GridRevealAction);
    expect(next.aspect).toBe("16:9");
    expect(next.xformTop.panX).toBe(0.5);
    expect(next.xformBottom.panX).toBe(0.5);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/generators/grid-reveal/__tests__/gridRevealReducer.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the reducer**

Create `src/generators/grid-reveal/gridRevealReducer.ts`:

```ts
// src/generators/grid-reveal/gridRevealReducer.ts
import type { AspectId, Orientation } from "@/lib/canvas/dimensions";
import {
  IDENTITY_XFORM,
  rollStrips,
  uniformStrips,
  type Transform,
} from "./layout";

export type { AspectId, Orientation };
export type Slot = "top" | "bottom";
export type GridMode = "equal" | "random";

export interface GridRevealState {
  aspect: AspectId;
  orientation: Orientation;
  exportSize: number; // long-edge px
  mode: GridMode;
  cols: number;
  rows: number;
  colStrips: number[]; // cols widths, sum 1
  rowStrips: number[]; // rows heights, sum 1
  cells: boolean[][]; // [rows][cols], false = Top shows
  xformTop: Transform;
  xformBottom: Transform;
}

export const DEFAULT_COLS = 4;
export const DEFAULT_ROWS = 3;
export const MIN_DIM = 1;
export const MAX_DIM = 12;

/** Fresh all-Top (all false) cell grid. */
function makeCells(rows: number, cols: number): boolean[][] {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => false),
  );
}

/** Strips for an axis under the given mode. */
function stripsFor(mode: GridMode, n: number): number[] {
  return mode === "equal" ? uniformStrips(n) : rollStrips(n);
}

function clampDim(n: number): number {
  if (!Number.isFinite(n)) return MIN_DIM;
  return Math.min(MAX_DIM, Math.max(MIN_DIM, Math.round(n)));
}

function clampPan(p: number): number {
  return Math.min(1, Math.max(0, p));
}

export const initialGridRevealState: GridRevealState = {
  aspect: "4:3",
  orientation: "lr",
  exportSize: 1080,
  mode: "equal",
  cols: DEFAULT_COLS,
  rows: DEFAULT_ROWS,
  colStrips: uniformStrips(DEFAULT_COLS),
  rowStrips: uniformStrips(DEFAULT_ROWS),
  cells: makeCells(DEFAULT_ROWS, DEFAULT_COLS),
  xformTop: { ...IDENTITY_XFORM },
  xformBottom: { ...IDENTITY_XFORM },
};

export type GridRevealAction =
  | { type: "SET_ASPECT"; aspect: AspectId }
  | { type: "SET_ORIENTATION"; orientation: Orientation }
  | { type: "SET_EXPORT_SIZE"; size: number }
  | { type: "SET_MODE"; mode: GridMode }
  | { type: "SET_COLS"; cols: number }
  | { type: "SET_ROWS"; rows: number }
  | { type: "REROLL" }
  | { type: "FLIP_CELL"; row: number; col: number }
  | { type: "SET_XFORM"; slot: Slot; xform: Transform }
  | { type: "RESET_XFORM"; slot: Slot };

export function gridRevealReducer(
  state: GridRevealState,
  action: GridRevealAction,
): GridRevealState {
  switch (action.type) {
    case "SET_ASPECT":
      // Window shape changed → re-cover both images (centered).
      return {
        ...state,
        aspect: action.aspect,
        xformTop: { ...IDENTITY_XFORM },
        xformBottom: { ...IDENTITY_XFORM },
      };
    case "SET_ORIENTATION":
      return {
        ...state,
        orientation: action.orientation,
        xformTop: { ...IDENTITY_XFORM },
        xformBottom: { ...IDENTITY_XFORM },
      };
    case "SET_EXPORT_SIZE":
      return { ...state, exportSize: action.size };
    case "SET_MODE": {
      if (action.mode === state.mode) return state;
      return {
        ...state,
        mode: action.mode,
        colStrips: stripsFor(action.mode, state.cols),
        rowStrips: stripsFor(action.mode, state.rows),
      };
    }
    case "SET_COLS": {
      const cols = clampDim(action.cols);
      return {
        ...state,
        cols,
        colStrips: stripsFor(state.mode, cols),
        cells: makeCells(state.rows, cols),
      };
    }
    case "SET_ROWS": {
      const rows = clampDim(action.rows);
      return {
        ...state,
        rows,
        rowStrips: stripsFor(state.mode, rows),
        cells: makeCells(rows, state.cols),
      };
    }
    case "REROLL":
      if (state.mode !== "random") return state;
      return {
        ...state,
        colStrips: rollStrips(state.cols),
        rowStrips: rollStrips(state.rows),
      };
    case "FLIP_CELL": {
      const { row, col } = action;
      if (row < 0 || row >= state.rows || col < 0 || col >= state.cols) return state;
      const cells = state.cells.map((r, ri) =>
        ri === row ? r.map((v, ci) => (ci === col ? !v : v)) : r,
      );
      return { ...state, cells };
    }
    case "SET_XFORM": {
      const xform: Transform = {
        panX: clampPan(action.xform.panX),
        panY: clampPan(action.xform.panY),
      };
      return action.slot === "top"
        ? { ...state, xformTop: xform }
        : { ...state, xformBottom: xform };
    }
    case "RESET_XFORM":
      return action.slot === "top"
        ? { ...state, xformTop: { ...IDENTITY_XFORM } }
        : { ...state, xformBottom: { ...IDENTITY_XFORM } };
    default:
      return state;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/generators/grid-reveal/__tests__/gridRevealReducer.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/generators/grid-reveal/gridRevealReducer.ts src/generators/grid-reveal/__tests__/gridRevealReducer.test.ts
git commit -m "feat(grid-reveal): state reducer with grid-mode, flip, pan actions"
```

---

## Task 3: Parameterize `exportStage` filename prefix

The export filename is hardcoded to `swap-collage-`; Grid Reveal needs `grid-reveal-`. Add an optional `prefix` arg (default keeps swap-collage identical).

**Files:**
- Modify: `src/export.ts`
- Modify: `src/__tests__/export.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/__tests__/export.test.ts` (inside the existing `describe("exportStage", ...)` block, before the closing `});` of the describe — the `BlobCallback` type alias at the bottom stays):

```ts
  it("uses the prefix in the download filename", async () => {
    const { stage } = makeStage(1);
    await exportStage(stage, "png", "grid-reveal");
    const anchor = document.createElement("a") as unknown as HTMLAnchorElement;
    expect(anchor.download.startsWith("grid-reveal-")).toBe(true);
    expect(anchor.download.endsWith(".png")).toBe(true);
  });

  it("defaults to the swap-collage prefix", async () => {
    const { stage } = makeStage(1);
    await exportStage(stage, "png");
    const anchor = document.createElement("a") as unknown as HTMLAnchorElement;
    expect(anchor.download.startsWith("swap-collage-")).toBe(true);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/__tests__/export.test.ts`
Expected: FAIL — `anchor.download` is "" (filename still hardcoded; the new prefix arg is ignored / not yet accepted, so TS may also error).

- [ ] **Step 3: Implement the prefix parameter**

Edit `src/export.ts`. Replace the `exportStage` function and the `filename` helper with:

```ts
export async function exportStage(
  stage: ExportableStage,
  format: ExportFormat,
  prefix = "swap-collage",
): Promise<void> {
  // The on-screen stage is scaled down from the logical size; invert it so the
  // exported canvas is exactly the logical (export) resolution.
  const pixelRatio = 1 / stage.scaleX();
  const canvas = stage.toCanvas({ pixelRatio });
  const mime = format === "png" ? "image/png" : "image/jpeg";
  const quality = format === "jpg" ? 0.92 : undefined;

  await new Promise<void>((resolve) => {
    canvas.toBlob((blob) => {
      if (blob) downloadBlob(blob, filename(format, prefix));
      resolve();
    }, mime, quality);
  });
}

function filename(format: ExportFormat, prefix: string): string {
  return `${prefix}-${Date.now()}.${format}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/__tests__/export.test.ts`
Expected: PASS (all export tests, including the two new ones).

- [ ] **Step 5: Commit**

```bash
git add src/export.ts src/__tests__/export.test.ts
git commit -m "feat(export): accept a filename prefix in exportStage"
```

---

## Task 4: Context provider (`GridRevealProvider.tsx`)

No unit test (React context + Konva refs; mirrors `SwapCollageProvider`, which is untested). Verified by typecheck in Task 8.

**Files:**
- Create: `src/generators/grid-reveal/GridRevealProvider.tsx`

- [ ] **Step 1: Create the provider**

Create `src/generators/grid-reveal/GridRevealProvider.tsx`:

```tsx
// src/generators/grid-reveal/GridRevealProvider.tsx
import {
  createContext,
  useContext,
  useReducer,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type RefObject,
} from "react";
import type Konva from "konva";
import { exportStage, type ExportFormat } from "@/export";
import { useImageBitmap, type ImgStatus } from "@/hooks/useImageBitmap";
import {
  gridRevealReducer,
  initialGridRevealState,
  type AspectId,
  type GridMode,
  type GridRevealAction,
  type GridRevealState,
  type Orientation,
  type Slot,
} from "./gridRevealReducer";
import type { Transform } from "./layout";

export interface ImageSlot {
  bitmap: ImageBitmap | null;
  name: string | null;
  status: ImgStatus;
  error: string | null;
}

export interface GridRevealContextValue {
  imgTop: ImageSlot;
  imgBottom: ImageSlot;
  loadImage: (slot: Slot, file: File) => Promise<void>;
  clearImage: (slot: Slot) => void;
  state: GridRevealState;
  dispatch: Dispatch<GridRevealAction>;
  stageRef: RefObject<Konva.Stage | null>;
  exportImage: (format: ExportFormat) => void;
  /** Which slot a canvas drag-drop loads into (shared with the sidebar control). */
  dropTarget: Slot;
  setDropTarget: (slot: Slot) => void;
}

const GridRevealContext = createContext<GridRevealContextValue | null>(null);

export function GridRevealProvider({ children }: { children: ReactNode }) {
  const top = useImageBitmap();
  const bottom = useImageBitmap();
  const [state, dispatch] = useReducer(gridRevealReducer, initialGridRevealState);
  const stageRef = useRef<Konva.Stage | null>(null);
  const [dropTarget, setDropTarget] = useState<Slot>("top");

  const loadImage = (slot: Slot, file: File) =>
    slot === "top" ? top.load(file) : bottom.load(file);

  const clearImage = (slot: Slot) => {
    if (slot === "top") top.reset();
    else bottom.reset();
    // Clearing an image resets its pan — no stale framing on an empty canvas.
    dispatch({ type: "RESET_XFORM", slot });
  };

  const exportImage = (format: ExportFormat) => {
    const stage = stageRef.current;
    if (!stage) return;
    // Hide the hit layer (tagged .overlay) for a chrome-free snapshot, then
    // restore. exportStage rasterizes synchronously before its first await.
    const overlays = stage.find<Konva.Node>(".overlay");
    const prior = overlays.map((n) => n.visible());
    overlays.forEach((n) => n.visible(false));
    exportStage(stage, format, "grid-reveal").finally(() =>
      overlays.forEach((n, i) => n.visible(prior[i])),
    );
  };

  const value: GridRevealContextValue = {
    imgTop: {
      bitmap: top.bitmap,
      name: top.name,
      status: top.status,
      error: top.error,
    },
    imgBottom: {
      bitmap: bottom.bitmap,
      name: bottom.name,
      status: bottom.status,
      error: bottom.error,
    },
    loadImage,
    clearImage,
    state,
    dispatch,
    stageRef,
    exportImage,
    dropTarget,
    setDropTarget,
  };

  return (
    <GridRevealContext.Provider value={value}>
      {children}
    </GridRevealContext.Provider>
  );
}

export function useGridReveal(): GridRevealContextValue {
  const ctx = useContext(GridRevealContext);
  if (!ctx) {
    throw new Error("useGridReveal must be used within GridRevealProvider");
  }
  return ctx;
}

export type { AspectId, GridMode, Orientation, Slot, Transform };
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/generators/grid-reveal/GridRevealProvider.tsx
git commit -m "feat(grid-reveal): context provider (images, state, export, drop target)"
```

---

## Task 5: Preview stage (`GridRevealPreview.tsx`)

No unit test (Konva/pointer; mirrors `SwapCollagePreview`). Verified by typecheck + manual run.

**Files:**
- Create: `src/generators/grid-reveal/GridRevealPreview.tsx`

- [ ] **Step 1: Create the preview**

Create `src/generators/grid-reveal/GridRevealPreview.tsx`:

```tsx
// src/generators/grid-reveal/GridRevealPreview.tsx
import { useEffect, useRef, useState, type Ref } from "react";
import { Group, Image, Layer, Rect, Stage } from "react-konva";
import type Konva from "konva";
import { useGridReveal } from "./GridRevealProvider";
import { useThemeColors } from "@/hooks/useThemeColors";
import { useFileDrop } from "@/components/canvas/useFileDrop";
import { DropHighlight } from "@/components/canvas/DropHighlight";
import { canvasDims } from "@/lib/canvas/dimensions";
import { containFit, coverFit } from "@/lib/canvas/fit";
import {
  BORDER_COLOR,
  BORDER_OPACITY,
  BORDER_WIDTH,
  cellRects,
  hitTest,
  placement,
  splitLines,
} from "./layout";
import type { Slot } from "./gridRevealReducer";

/** Click vs drag threshold in CSS px (pointer movement below this = click). */
const CLICK_THRESHOLD_PX = 3;

interface DragState {
  startClientX: number;
  startClientY: number;
  startPanX: number;
  startPanY: number;
  row: number;
  col: number;
  slot: Slot;
  moved: boolean;
}

export function GridRevealPreview() {
  const {
    imgTop,
    imgBottom,
    state,
    dispatch,
    stageRef,
    loadImage,
    dropTarget,
  } = useGridReveal();
  const { background } = useThemeColors();
  const containerRef = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState({ w: 0, h: 0 });
  const dragRef = useRef<DragState | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setAvail({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const dims = canvasDims(state.aspect, state.orientation, state.exportSize);
  const { dispW, dispH, scale } = containFit(
    dims.cw,
    dims.ch,
    avail.w || dims.cw,
    avail.h || dims.ch,
  );

  const grid = cellRects(state.colStrips, state.rowStrips, dims.cw, dims.ch);
  const colLines = splitLines(state.colStrips, dims.cw);
  const rowLines = splitLines(state.rowStrips, dims.ch);

  const topBmp = imgTop.bitmap;
  const bottomBmp = imgBottom.bitmap;
  const topPlace = topBmp
    ? placement(topBmp.width, topBmp.height, dims.cw, dims.ch, state.xformTop)
    : null;
  const bottomPlace = bottomBmp
    ? placement(bottomBmp.width, bottomBmp.height, dims.cw, dims.ch, state.xformBottom)
    : null;

  const bothReady = imgTop.status === "ready" && imgBottom.status === "ready";

  // Map a screen point to logical canvas coords via the stage container rect.
  const toLogical = (clientX: number, clientY: number) => {
    const rect = stageRef.current?.container().getBoundingClientRect();
    if (!rect) return null;
    return { x: (clientX - rect.left) / scale, y: (clientY - rect.top) / scale };
  };

  const onPointerDown = (e: Konva.KonvaEventObject<PointerEvent>) => {
    if (!bothReady) return;
    const lp = toLogical(e.evt.clientX, e.evt.clientY);
    if (!lp) return;
    const hit = hitTest(lp.x, lp.y, state.colStrips, state.rowStrips, dims.cw, dims.ch);
    if (!hit) return;
    const slot: Slot = state.cells[hit.row][hit.col] ? "bottom" : "top";
    const xform = slot === "top" ? state.xformTop : state.xformBottom;
    dragRef.current = {
      startClientX: e.evt.clientX,
      startClientY: e.evt.clientY,
      startPanX: xform.panX,
      startPanY: xform.panY,
      row: hit.row,
      col: hit.col,
      slot,
      moved: false,
    };
  };

  const onPointerMove = (e: Konva.KonvaEventObject<PointerEvent>) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.evt.clientX - d.startClientX;
    const dy = e.evt.clientY - d.startClientY;
    if (!d.moved && Math.hypot(dx, dy) < CLICK_THRESHOLD_PX) return;
    d.moved = true;
    const bmp = d.slot === "top" ? topBmp : bottomBmp;
    if (!bmp) return;
    // Slack = how far the cover-fit image exceeds the canvas (logical px).
    const coverScale = coverFit(bmp.width, bmp.height, dims.cw, dims.ch).scale;
    const slackX = bmp.width * coverScale - dims.cw;
    const slackY = bmp.height * coverScale - dims.ch;
    // Dragging the image right (dx>0) reveals more of its left → panX drops.
    const panX = slackX > 0 ? d.startPanX - dx / scale / slackX : d.startPanX;
    const panY = slackY > 0 ? d.startPanY - dy / scale / slackY : d.startPanY;
    dispatch({ type: "SET_XFORM", slot: d.slot, xform: { panX, panY } });
  };

  const onPointerUp = () => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d || d.moved) return; // a drag already committed pan; click → flip
    dispatch({ type: "FLIP_CELL", row: d.row, col: d.col });
  };

  // Drag-drop a file anywhere on the canvas → load into the selected slot.
  const { dropProps, hoveredTarget } = useFileDrop<Slot>({
    stageRef,
    resolve: () => dropTarget, // whole canvas is the target
    onDrop: (file, slot) => loadImage(slot, file),
  });

  return (
    <div
      ref={containerRef}
      className="flex h-full w-full items-center justify-center"
      {...dropProps}
    >
      <Stage
        ref={stageRef as unknown as Ref<Konva.Stage>}
        width={dispW}
        height={dispH}
        scaleX={scale}
        scaleY={scale}
      >
        {/* Image layer: one clipped draw per cell, at viewport placement so
            each image reads as one continuous picture across its cells. */}
        <Layer>
          <Rect
            x={0}
            y={0}
            width={dims.cw}
            height={dims.ch}
            fill={background}
            listening={false}
          />
          {grid.map((row, ri) =>
            row.map((cell, ci) => {
              const showBottom = state.cells[ri][ci];
              const bmp = showBottom ? bottomBmp : topBmp;
              const place = showBottom ? bottomPlace : topPlace;
              if (!bmp || !place) return null;
              return (
                <Group
                  key={`cell-${ri}-${ci}`}
                  clip={{ x: cell.x, y: cell.y, width: cell.w, height: cell.h }}
                >
                  <Image
                    image={bmp}
                    x={place.x}
                    y={place.y}
                    width={place.width}
                    height={place.height}
                    listening={false}
                  />
                </Group>
              );
            }),
          )}
        </Layer>

        {/* Border layer: always drawn (empty-state skeleton), baked into export. */}
        <Layer listening={false}>
          {colLines.map((x, i) => (
            <Rect
              key={`cv-${i}`}
              x={x - BORDER_WIDTH / 2}
              y={0}
              width={BORDER_WIDTH}
              height={dims.ch}
              fill={BORDER_COLOR}
              opacity={BORDER_OPACITY}
            />
          ))}
          {rowLines.map((y, i) => (
            <Rect
              key={`rh-${i}`}
              x={0}
              y={y - BORDER_WIDTH / 2}
              width={dims.cw}
              height={BORDER_WIDTH}
              fill={BORDER_COLOR}
              opacity={BORDER_OPACITY}
            />
          ))}
        </Layer>

        {/* Drop highlight over the whole canvas while dragging a file in. */}
        {hoveredTarget !== null && (
          <Layer listening={false}>
            <DropHighlight
              x={0}
              y={0}
              width={dims.cw}
              height={dims.ch}
              scale={scale}
              visible
            />
          </Layer>
        )}

        {/* Hit layer: transparent, captures pointer; hidden at export (.overlay). */}
        <Layer>
          <Rect
            name="overlay"
            x={0}
            y={0}
            width={dims.cw}
            height={dims.ch}
            fill="rgba(0,0,0,0)"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          />
        </Layer>
      </Stage>
    </div>
  );
}
```

- [ ] **Step 2: Verify the `DropHighlight` prop signature**

Run: `grep -n "export function DropHighlight" src/components/canvas/DropHighlight.tsx`
Confirm its props include `x, y, width, height, scale, visible`. (Swap Collage uses exactly these; if the names differ, adjust the call above to match.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/generators/grid-reveal/GridRevealPreview.tsx
git commit -m "feat(grid-reveal): preview stage with cell-reveal rendering and click/drag pan"
```

---

## Task 6: Sidebar controls (`GridRevealControls.tsx`)

No unit test (UI). Verified by typecheck + manual run.

**Files:**
- Create: `src/generators/grid-reveal/GridRevealControls.tsx`

- [ ] **Step 1: Create the controls**

Create `src/generators/grid-reveal/GridRevealControls.tsx`:

```tsx
// src/generators/grid-reveal/GridRevealControls.tsx
import { useRef, useState, type ChangeEvent } from "react";
import { Download, Shuffle } from "lucide-react";
import { useGridReveal } from "./GridRevealProvider";
import { type ExportFormat } from "@/export";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { FieldLabel } from "@/components/canvas/FieldLabel";
import { ExportControls } from "@/components/canvas/ExportControls";
import {
  MAX_DIM,
  MIN_DIM,
  type AspectId,
  type Orientation,
  type Slot,
} from "./gridRevealReducer";

/** One slot's source affordance: empty → "Choose source", ready → filename,
 *  error → message. The bar opens the file picker (replace); ✕ clears. Owns its
 *  hidden input. (Lean local copy — the shared ImageSlotControls forces zoom +
 *  filters props that Grid Reveal v1 doesn't have.) */
function SourceControl({
  name,
  status,
  error,
  onPick,
  onClear,
}: {
  name: string | null;
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
  onPick: (file: File) => void;
  onClear: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const busy = status === "loading";
  const ready = status === "ready";
  const isError = status === "error";

  const onPickFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) onPick(f);
    e.target.value = "";
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative">
        <Button
          type="button"
          variant="outline"
          className="h-9 w-full justify-start gap-2 font-normal text-muted-foreground"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          <span className={isError ? "text-destructive" : ready ? "text-foreground" : ""}>
            {ready ? name : isError ? (error ?? "error") : busy ? "Loading…" : "Choose source"}
          </span>
        </Button>
        {ready && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground"
            onClick={onClear}
            aria-label="Clear source"
          >
            ✕
          </Button>
        )}
      </div>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPickFile} />
    </div>
  );
}

/** Whole-number grid-dimension input clamped to [MIN_DIM, MAX_DIM]. */
function DimInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  const commit = (raw: string) => {
    const n = Number(raw);
    const clamped = Number.isFinite(n)
      ? Math.min(MAX_DIM, Math.max(MIN_DIM, Math.round(n)))
      : MIN_DIM;
    onChange(clamped);
  };
  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel>{label}</FieldLabel>
      <Input
        type="number"
        min={MIN_DIM}
        max={MAX_DIM}
        defaultValue={value}
        key={value}
        className="h-9"
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
      />
    </div>
  );
}

export function GridRevealControls() {
  const {
    imgTop,
    imgBottom,
    loadImage,
    clearImage,
    state,
    dispatch,
    exportImage,
    dropTarget,
    setDropTarget,
  } = useGridReveal();
  const [format, setFormat] = useState<ExportFormat>("png");

  const bothReady = imgTop.status === "ready" && imgBottom.status === "ready";

  return (
    <div className="flex h-full w-full flex-col p-4">
      <Accordion
        type="multiple"
        defaultValue={["image-top", "image-bottom", "grid"]}
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden scrollbar-none"
      >
        <AccordionItem value="image-top">
          <AccordionTrigger>Top image</AccordionTrigger>
          <AccordionContent className="space-y-4">
            <SourceControl
              name={imgTop.name}
              status={imgTop.status}
              error={imgTop.error}
              onPick={(file) => loadImage("top", file)}
              onClear={() => clearImage("top")}
            />
            <Button
              variant="outline"
              className="w-full"
              onClick={() => dispatch({ type: "RESET_XFORM", slot: "top" })}
            >
              Reset pan
            </Button>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="image-bottom">
          <AccordionTrigger>Bottom image</AccordionTrigger>
          <AccordionContent className="space-y-4">
            <SourceControl
              name={imgBottom.name}
              status={imgBottom.status}
              error={imgBottom.error}
              onPick={(file) => loadImage("bottom", file)}
              onClear={() => clearImage("bottom")}
            />
            <Button
              variant="outline"
              className="w-full"
              onClick={() => dispatch({ type: "RESET_XFORM", slot: "bottom" })}
            >
              Reset pan
            </Button>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="grid">
          <AccordionTrigger>Grid</AccordionTrigger>
          <AccordionContent className="space-y-4">
            <div className="flex flex-col gap-2">
              <FieldLabel>Mode</FieldLabel>
              <Tabs
                value={state.mode}
                onValueChange={(v) =>
                  dispatch({ type: "SET_MODE", mode: v as "equal" | "random" })
                }
              >
                <TabsList className="w-full">
                  <TabsTrigger value="equal">Equal</TabsTrigger>
                  <TabsTrigger value="random">Random</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <DimInput
                  label="Columns"
                  value={state.cols}
                  onChange={(n) => dispatch({ type: "SET_COLS", cols: n })}
                />
              </div>
              <div className="flex-1">
                <DimInput
                  label="Rows"
                  value={state.rows}
                  onChange={(n) => dispatch({ type: "SET_ROWS", rows: n })}
                />
              </div>
            </div>
            <Button
              variant="outline"
              className="w-full"
              disabled={state.mode !== "random"}
              onClick={() => dispatch({ type: "REROLL" })}
            >
              <Shuffle /> Re-roll
            </Button>
            <div className="flex flex-col gap-2">
              <FieldLabel>Drop target</FieldLabel>
              <Tabs
                value={dropTarget}
                onValueChange={(v) => setDropTarget(v as Slot)}
              >
                <TabsList className="w-full">
                  <TabsTrigger value="top">Top</TabsTrigger>
                  <TabsTrigger value="bottom">Bottom</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="canvas">
          <AccordionTrigger>Canvas</AccordionTrigger>
          <AccordionContent className="space-y-4">
            <div className="flex flex-col gap-2">
              <FieldLabel>Aspect</FieldLabel>
              <Tabs
                value={state.aspect}
                onValueChange={(v) =>
                  dispatch({ type: "SET_ASPECT", aspect: v as AspectId })
                }
              >
                <TabsList className="w-full">
                  <TabsTrigger value="16:9">16:9</TabsTrigger>
                  <TabsTrigger value="4:3">4:3</TabsTrigger>
                  <TabsTrigger value="1:1">1:1</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <div className="flex flex-col gap-2">
              <FieldLabel>Orientation</FieldLabel>
              <Tabs
                value={state.orientation}
                onValueChange={(v) =>
                  dispatch({
                    type: "SET_ORIENTATION",
                    orientation: v as Orientation,
                  })
                }
              >
                <TabsList className="w-full">
                  <TabsTrigger value="lr">Landscape</TabsTrigger>
                  <TabsTrigger value="tb">Portrait</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="export">
          <AccordionTrigger>Export</AccordionTrigger>
          <AccordionContent className="space-y-4">
            <ExportControls
              size={state.exportSize}
              onSize={(n) => dispatch({ type: "SET_EXPORT_SIZE", size: n })}
              format={format}
              onFormat={(f) => setFormat(f)}
            />
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <div className="pt-4">
        <Button onClick={() => exportImage(format)} disabled={!bothReady} className="w-full">
          <Download /> Export
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/generators/grid-reveal/GridRevealControls.tsx
git commit -m "feat(grid-reveal): sidebar controls (sources, grid mode/dims, canvas, export)"
```

---

## Task 7: Generator object + registry registration

**Files:**
- Create: `src/generators/grid-reveal/index.ts`
- Modify: `src/app/registry.ts`

- [ ] **Step 1: Create the generator object**

Create `src/generators/grid-reveal/index.ts`:

```ts
// src/generators/grid-reveal/index.ts
import { Grid3x3 } from "lucide-react";
import type { Generator } from "@/app/registry";
import { GridRevealControls } from "./GridRevealControls";
import { GridRevealPreview } from "./GridRevealPreview";
import { GridRevealProvider } from "./GridRevealProvider";

export const gridRevealGenerator: Generator = {
  id: "grid-reveal",
  name: "Grid Reveal",
  icon: Grid3x3,
  Preview: GridRevealPreview,
  Controls: GridRevealControls,
  Provider: GridRevealProvider,
};
```

- [ ] **Step 2: Register it**

Edit `src/app/registry.ts`. Replace its contents with:

```ts
import type { FC, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { swapCollageGenerator } from "../generators/swap-collage";
import { gridRevealGenerator } from "../generators/grid-reveal";

export type Generator = {
  id: string;
  name: string;
  icon?: LucideIcon;
  Preview: FC;
  Controls: FC;
  Provider?: FC<{ children: ReactNode }>;
};

export const registry: Generator[] = [swapCollageGenerator, gridRevealGenerator];
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/generators/grid-reveal/index.ts src/app/registry.ts
git commit -m "feat(grid-reveal): register Grid Reveal generator"
```

---

## Task 8: Docs + full verification

**Files:**
- Modify: `CONTEXT.md`

- [ ] **Step 1: Append Grid Reveal language to CONTEXT.md**

Append the following section to the end of `CONTEXT.md` (after the existing "### Filters" / "### General" content), keeping the file's existing headings intact:

```markdown

### Grid reveal

**Slot**:
One of the two stacked images — **Top** (overlays) or **Bottom** (beneath). Both cover the export viewport.
_Avoid_: layer, panel.

**Strip**:
One column-width or row-height partition of the canvas. `cols` column strips × `rows` row strips form the grid. In **equal** mode strips are uniform; in **random** mode each is clamped to a min/max of the uniform size and re-rollable.
_Avoid_: band, lane.

**Cell**:
The intersection of one column strip × one row strip — a window showing Top or Bottom.
_Avoid_: tile (that belongs to swap collage), square.

**Cell state**:
The per-cell boolean. `false` = Top shows (default), `true` = Bottom shows. Click flips it.
_Avoid_: flag (too generic).

**Grid mode**:
`equal` (uniform strips) or `random` (clamped random strips, re-rollable).

**Transform**:
A slot's per-image pan `{ panX, panY } ∈ [0,1]` (0.5 centered). Dragging a cell pans the image it reveals, everywhere that image shows.
```

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: all tests pass (swap-collage, geometry, export, grid-reveal-layout, gridRevealReducer).

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 4: Production build**

Run: `npm run build`
Expected: builds cleanly (tsc + vite).

- [ ] **Step 5: Manual verification**

Run: `npm run dev`
Open the local URL. In the left nav, switch to **Grid Reveal**. Confirm:
1. With no images: the grey semi-transparent grid (`4×3`, equal) is visible over the canvas background.
2. Load Top and Bottom images. Whole canvas shows the Top image through every cell.
3. Click a cell → it flips to Bottom. Click again → back to Top. Adjacent same-image cells read as one continuous image.
4. Drag a Top cell → the Top image pans (everywhere it shows); drag a Bottom cell → Bottom pans. A tiny drag (< 3px) still registers as a click (flip), not a pan.
5. Switch Grid → Mode to Random: strips become irregular; cells preserve their state. **Re-roll** reshuffles strips (disabled in Equal mode).
6. Change Columns/Rows: grid redraws and cells reset to all-Top.
7. Change Aspect/Orientation: both images re-cover (centered).
8. Drop a file on the canvas → loads into the selected Drop target (Top/Bottom).
9. Export PNG → downloaded file is `grid-reveal-<ts>.png`, borders included, hit layer not visible.
10. Switch back to **Swap Collage** — still works unchanged.

- [ ] **Step 6: Commit**

```bash
git add CONTEXT.md
git commit -m "docs(grid-reveal): add grid reveal language to CONTEXT.md"
```

---

## Done

Grid Reveal is fully implemented, tested, and registered. The branch (`docs/grid-reveal-spec` was used for the spec; this implementation continues on a feature branch) holds the complete, verified generator. Next step: finish the branch (merge / PR) via the finishing-a-development-branch skill.
