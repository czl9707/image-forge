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
  it("clamps pan into [0,1] and preserves zoom", () => {
    const next = gridRevealReducer(initialGridRevealState, {
      type: "SET_XFORM",
      slot: "top",
      xform: { panX: -5, panY: 99, zoom: 2 },
    } as GridRevealAction);
    expect(next.xformTop).toEqual({ panX: 0, panY: 1, zoom: 2 });
  });

  it("writes Bottom slot", () => {
    const next = gridRevealReducer(initialGridRevealState, {
      type: "SET_XFORM",
      slot: "bottom",
      xform: { panX: 0.2, panY: 0.8, zoom: 1.5 },
    } as GridRevealAction);
    expect(next.xformBottom).toEqual({ panX: 0.2, panY: 0.8, zoom: 1.5 });
  });
});

describe("SET_FILTERS", () => {
  it("writes the Top slot's filter stack", () => {
    const stack = [{ id: "x", kind: "blur", enabled: true, radius: 4 }] as never;
    const next = gridRevealReducer(initialGridRevealState, {
      type: "SET_FILTERS",
      slot: "top",
      filters: stack,
    } as GridRevealAction);
    expect(next.filtersTop).toBe(stack);
    expect(next.filtersBottom).toEqual([]);
  });

  it("writes the Bottom slot's filter stack", () => {
    const stack = [{ id: "y", kind: "brightness", enabled: true, value: 1.2 }] as never;
    const next = gridRevealReducer(initialGridRevealState, {
      type: "SET_FILTERS",
      slot: "bottom",
      filters: stack,
    } as GridRevealAction);
    expect(next.filtersBottom).toBe(stack);
  });
});

describe("SET_ASPECT", () => {
  it("resets both transforms to centered", () => {
    const moved = gridRevealReducer(initialGridRevealState, {
      type: "SET_XFORM",
      slot: "top",
      xform: { panX: 0, panY: 0, zoom: 3 },
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
