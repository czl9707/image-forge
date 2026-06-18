// src/generators/swap-collage/__tests__/swapReducer.test.ts
import { describe, expect, it } from "vitest";
import {
  swapReducer,
  initialSwapState,
  DEFAULT_MASK,
  type SwapAction,
} from "../swapReducer";

describe("swapReducer", () => {
  it("has the expected initial state", () => {
    expect(initialSwapState.orientation).toBe("lr");
    expect(initialSwapState.aspect).toBe("landscape");
    expect(initialSwapState.exportSize).toBe(1080);
    expect(initialSwapState.mask).toEqual(DEFAULT_MASK);
    expect(initialSwapState.xformA.zoom).toBe(1);
    expect(initialSwapState.selection).toBeNull();
  });

  it("sets orientation", () => {
    const s = swapReducer(initialSwapState, {
      type: "SET_ORIENTATION",
      orientation: "tb",
    } as SwapAction);
    expect(s.orientation).toBe("tb");
  });

  it("changes aspect AND re-fits both images", () => {
    const moved: SwapAction = {
      type: "SET_XFORM",
      slot: "A",
      xform: { panX: 0.5, panY: 0.5, zoom: 2 },
    };
    const after = swapReducer(
      swapReducer(initialSwapState, moved),
      { type: "SET_ASPECT", aspect: "square" } as SwapAction,
    );
    expect(after.aspect).toBe("square");
    expect(after.xformA.zoom).toBe(1); // reset
    expect(after.xformA.panX).toBe(0);
  });

  it("sets export size", () => {
    const s = swapReducer(initialSwapState, {
      type: "SET_EXPORT_SIZE",
      size: 2160,
    } as SwapAction);
    expect(s.exportSize).toBe(2160);
  });

  it("clamps the mask on SET_MASK", () => {
    const s = swapReducer(initialSwapState, {
      type: "SET_MASK",
      mask: { x: 5, y: 5, w: 0.01, h: 0.01 },
    } as SwapAction);
    expect(s.mask.w).toBeGreaterThanOrEqual(0.05);
    expect(s.mask.x + s.mask.w).toBeLessThanOrEqual(1.0000001);
  });

  it("sets per-slot transform", () => {
    const s = swapReducer(initialSwapState, {
      type: "SET_XFORM",
      slot: "B",
      xform: { panX: 0.1, panY: 0.2, zoom: 1.5 },
    } as SwapAction);
    expect(s.xformB.zoom).toBe(1.5);
    expect(s.xformA.zoom).toBe(1); // untouched
  });

  it("sets selection", () => {
    const s = swapReducer(initialSwapState, {
      type: "SET_SELECTION",
      selection: "mask",
    } as SwapAction);
    expect(s.selection).toBe("mask");
  });

  it("resets the mask", () => {
    const moved = swapReducer(initialSwapState, {
      type: "SET_MASK",
      mask: { x: 0, y: 0, w: 0.2, h: 0.2 },
    } as SwapAction);
    const s = swapReducer(moved, { type: "RESET_MASK" } as SwapAction);
    expect(s.mask).toEqual(DEFAULT_MASK);
  });
});
