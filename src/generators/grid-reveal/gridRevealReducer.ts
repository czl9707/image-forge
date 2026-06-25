// src/generators/grid-reveal/gridRevealReducer.ts
import type { AspectId, Orientation } from "@/lib/canvas/dimensions";
import type { FilterStack } from "@/lib/filters";
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
  filtersTop: FilterStack;
  filtersBottom: FilterStack;
}

export const DEFAULT_COLS = 8;
export const DEFAULT_ROWS = 6;
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
  mode: "random",
  cols: DEFAULT_COLS,
  rows: DEFAULT_ROWS,
  colStrips: rollStrips(DEFAULT_COLS),
  rowStrips: rollStrips(DEFAULT_ROWS),
  cells: makeCells(DEFAULT_ROWS, DEFAULT_COLS),
  xformTop: { ...IDENTITY_XFORM },
  xformBottom: { ...IDENTITY_XFORM },
  filtersTop: [],
  filtersBottom: [],
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
  | { type: "SET_FILTERS"; slot: Slot; filters: FilterStack }
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
      // Pan is clamped to [0,1]; zoom passes through (cover-fit × zoom, ≥1).
      const xform: Transform = {
        panX: clampPan(action.xform.panX),
        panY: clampPan(action.xform.panY),
        zoom: action.xform.zoom,
      };
      return action.slot === "top"
        ? { ...state, xformTop: xform }
        : { ...state, xformBottom: xform };
    }
    case "SET_FILTERS":
      return action.slot === "top"
        ? { ...state, filtersTop: action.filters }
        : { ...state, filtersBottom: action.filters };
    case "RESET_XFORM":
      return action.slot === "top"
        ? { ...state, xformTop: { ...IDENTITY_XFORM } }
        : { ...state, xformBottom: { ...IDENTITY_XFORM } };
    default:
      return state;
  }
}
