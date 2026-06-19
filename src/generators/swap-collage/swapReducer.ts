// src/generators/swap-collage/swapReducer.ts
import { clampRect, type Rect } from "@/lib/geometry";

export type Orientation = "lr" | "tb";
export type AspectId = "16:9" | "4:3" | "1:1";
export type Selection = "imgA" | "imgB" | "mask" | null;
export type Slot = "A" | "B";

export interface Transform {
  panX: number; // fraction of tile width (0 = cover-centered)
  panY: number; // fraction of tile height
  zoom: number; // multiplier of cover scale (1 = cover)
}

export type Mask = Rect; // normalized [0,1] per-tile

export interface SwapState {
  orientation: Orientation;
  aspect: AspectId;
  exportSize: number; // long-edge px
  mask: Mask;
  xformA: Transform;
  xformB: Transform;
  selection: Selection;
}

export const MASK_MIN = 0.05;
export const DEFAULT_MASK: Mask = { x: 0.3, y: 0.3, w: 0.4, h: 0.4 };
export const IDENTITY_XFORM: Transform = { panX: 0, panY: 0, zoom: 1 };

export const initialSwapState: SwapState = {
  orientation: "lr",
  aspect: "16:9",
  exportSize: 1080,
  mask: DEFAULT_MASK,
  xformA: { ...IDENTITY_XFORM },
  xformB: { ...IDENTITY_XFORM },
  selection: null,
};

export type SwapAction =
  | { type: "SET_ORIENTATION"; orientation: Orientation }
  | { type: "SET_ASPECT"; aspect: AspectId }
  | { type: "SET_EXPORT_SIZE"; size: number }
  | { type: "SET_MASK"; mask: Mask }
  | { type: "SET_XFORM"; slot: Slot; xform: Transform }
  | { type: "SET_SELECTION"; selection: Selection }
  | { type: "RESET_XFORM"; slot: Slot };

export function swapReducer(state: SwapState, action: SwapAction): SwapState {
  switch (action.type) {
    case "SET_ORIENTATION":
      // Canvas rotates (lr↔tb) → tile shape changes → re-cover both images.
      return {
        ...state,
        orientation: action.orientation,
        xformA: { ...IDENTITY_XFORM },
        xformB: { ...IDENTITY_XFORM },
      };
    case "SET_ASPECT":
      // Window shape changed → re-cover both images.
      return {
        ...state,
        aspect: action.aspect,
        xformA: { ...IDENTITY_XFORM },
        xformB: { ...IDENTITY_XFORM },
      };
    case "SET_EXPORT_SIZE":
      return { ...state, exportSize: action.size };
    case "SET_MASK":
      return { ...state, mask: clampRect(action.mask, MASK_MIN) };
    case "SET_XFORM":
      return action.slot === "A"
        ? { ...state, xformA: action.xform }
        : { ...state, xformB: action.xform };
    case "SET_SELECTION":
      return { ...state, selection: action.selection };
    case "RESET_XFORM":
      return action.slot === "A"
        ? { ...state, xformA: { ...IDENTITY_XFORM } }
        : { ...state, xformB: { ...IDENTITY_XFORM } };
    default:
      return state;
  }
}
